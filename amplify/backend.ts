import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { storage } from './storage/resource';
import { data, generateShortFunction, generateLongVideoOutputFunction, uploadToYouTubeFunction, suggestVideoMetadataFunction, exchangeYouTubeTokenFunction, checkYouTubeConnectionFunction } from './data/resource'
import { GenerateShortStateMachine, VideoUploadStateMachine, UnifiedReasoningStateMachine, LongVideoProcessStateMachine, GenerateLongVideoStateMachine, YouTubeUpload } from './custom/resource';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { EventBus, CfnRule } from 'aws-cdk-lib/aws-events'
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib/core';

// Define base infrastructure
const backend = defineBackend({
  auth,
  storage,
  data,
  generateShortFunction,
  generateLongVideoOutputFunction,
  uploadToYouTubeFunction,
  suggestVideoMetadataFunction,
  exchangeYouTubeTokenFunction,
  checkYouTubeConnectionFunction,
});

// Configure base resources
const s3Bucket = backend.storage.resources.bucket;
const cfnBucket = s3Bucket.node.defaultChild as CfnBucket;
cfnBucket.accelerateConfiguration = {
  accelerationStatus: "Enabled"
};
cfnBucket.notificationConfiguration = {
  eventBridgeConfiguration: {
    eventBridgeEnabled: true,
  },
}

// Deploy assets
new BucketDeployment(Stack.of(s3Bucket), "UploadBackgroundImage", {
  sources: [Source.asset("./amplify/assets")],
  destinationBucket: s3Bucket,
  destinationKeyPrefix: "assets"
});

const highlightTable = backend.data.resources.tables["Highlight"]
const historyTable = backend.data.resources.tables["History"]
const galleryTable = backend.data.resources.tables["Gallery"]
const longVideoEditTable = backend.data.resources.tables["LongVideoEdit"]
const longVideoSegmentTable = backend.data.resources.tables["LongVideoSegment"]
const longVideoOutputTable = backend.data.resources.tables["LongVideoOutput"]

// Create EventBridge resources first
const eventStack = backend.createStack("EventBridgeStack");
const eventBus = EventBus.fromEventBusName(eventStack, "EventBus", "default");

// Create UnifiedReasoning Step Function first
const unifiedReasoningStack = backend.createStack("UnifiedReasoningStack");
const unifiedReasoningStateMachine = new UnifiedReasoningStateMachine(
  unifiedReasoningStack,
  "UnifiedReasoningStateMachine",
  {
    bucket: s3Bucket,
    historyTable: historyTable,
    highlightTable: highlightTable
  }
);

// Set environment variable for UnifiedReasoning state machine ARN
process.env.UNIFIED_REASONING_STATE_MACHINE = unifiedReasoningStateMachine.stateMachine.stateMachineArn;

// Add EventBridge data source after all stacks are created
backend.data.addEventBridgeDataSource("EventBridgeDataSource", eventBus);

const eventBusRole = new Role(eventStack, "AppSyncInvokeRole", {
  assumedBy: new ServicePrincipal("events.amazonaws.com"),
  inlinePolicies: {
    AppSyncPolicy: new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["appsync:GraphQL"],
          resources: [`${backend.data.resources.graphqlApi.arn}/types/Mutation/*`],
        }),
      ],
    }),
  },
});

// Configure EventBridge rule for short-form StageChanged
new CfnRule(eventStack, "AppSyncRule", {
  eventBusName: eventBus.eventBusName,
  eventPattern: {
    ["detail-type"]: ["StageChanged"],
  },
  targets: [
    {
      arn: backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlEndpointArn,
      id: "stageChangeReceiver",
      roleArn: eventBusRole.roleArn,
      appSyncParameters: {
        graphQlOperation: `
        mutation Publish($videoId: String!, $stage: Int!) {
          publish(videoId: $videoId, stage: $stage) {
            videoId
            stage
          }
        }`,
      },
      inputTransformer: {
        inputPathsMap: {
          videoId: "$.detail.videoId",
          stage: "$.detail.stage",
        },
        inputTemplate: `{"videoId": "<videoId>", "stage": <stage>}`,
      },
    },
  ],
});

// Configure EventBridge rule for long video LongVideoStageChanged
new CfnRule(eventStack, "LongVideoAppSyncRule", {
  eventBusName: eventBus.eventBusName,
  eventPattern: {
    ["detail-type"]: ["LongVideoStageChanged"],
  },
  targets: [
    {
      arn: backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlEndpointArn,
      id: "longVideoStageChangeReceiver",
      roleArn: eventBusRole.roleArn,
      appSyncParameters: {
        graphQlOperation: `
        mutation PublishLongVideo($videoId: String!, $stage: Int!) {
          publishLongVideo(videoId: $videoId, stage: $stage) {
            videoId
            stage
          }
        }`,
      },
      inputTransformer: {
        inputPathsMap: {
          videoId: "$.detail.videoId",
          stage: "$.detail.stage",
        },
        inputTemplate: `{"videoId": "<videoId>", "stage": <stage>}`,
      },
    },
  ],
});

// Configure video upload handling
const stepfunctionStack = backend.createStack("StepFunctionStack");
const videoUploadStateMachine = new VideoUploadStateMachine(
  stepfunctionStack,
  "VideoUploadStateMachine",
  {
    bucket: s3Bucket,
    historyTable: historyTable,
    highlightTable: highlightTable
  }
);

s3Bucket.grantReadWrite(videoUploadStateMachine.stateMachine);

const videoUploadStateMachineRole = new Role(stepfunctionStack, "VideoUploadStateMachineExecuteRole", {
  assumedBy: new ServicePrincipal("events.amazonaws.com"),
  inlinePolicies: {
    StateMachineExecutePolicy: new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["states:StartExecution"],
          resources: ["*"],
        }),
      ],
    }),
  },
});

new CfnRule(
  stepfunctionStack,
  "VideoUploadStateMachineRule",
  {
    eventPattern: {
      source: ["aws.s3"],
      ["detail-type"]: ["Object Created"],
      detail: {
        bucket: {
          name: [s3Bucket.bucketName],
        },
        object: {
          key: [{ prefix: "*/" }, { suffix: "RAW.mp4" }],
        },
      },
    },
    targets: [
      {
        arn: videoUploadStateMachine.stateMachine.stateMachineArn,
        id: "videoUploadStateMachine",
        roleArn: videoUploadStateMachineRole.roleArn,
      },
    ],
  }
);

// generate short video
const generateShortStack = backend.generateShortFunction.stack;
const generateShortStateMachine = new GenerateShortStateMachine(
  generateShortStack,
  "GenerateShortStateMachine",
  {
    bucket: s3Bucket,
    historyTable: historyTable,
    highlightTable: highlightTable,
    galleryTable: galleryTable,
  }
)

const generateShortFunc = backend.generateShortFunction.resources;

generateShortFunc.lambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["states:StartExecution"],
      resources: ["*"],
    }),
)

generateShortFunc.cfnResources.cfnFunction.environment = {
  variables: {
    STATE_MACHINE: generateShortStateMachine.stateMachine.stateMachineArn,
    BUCKET_NAME: s3Bucket.bucketName,
  }
}

// ============================================================
// Long Video Processing
// ============================================================

// Long Video Process Step Function (triggered by S3 LONG_RAW.mp4 upload)
// Use stepfunctionStack to avoid circular dependency (data stack <-> new stack)
const longVideoProcessStateMachine = new LongVideoProcessStateMachine(
  stepfunctionStack,
  "LongVideoProcessStateMachine",
  {
    bucket: s3Bucket,
    longVideoEditTable: longVideoEditTable,
    longVideoSegmentTable: longVideoSegmentTable,
  }
);

s3Bucket.grantReadWrite(longVideoProcessStateMachine.stateMachine);

const longVideoProcessRole = new Role(stepfunctionStack, "LongVideoProcessExecuteRole", {
  assumedBy: new ServicePrincipal("events.amazonaws.com"),
  inlinePolicies: {
    StateMachineExecutePolicy: new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["states:StartExecution"],
          resources: ["*"],
        }),
      ],
    }),
  },
});

// S3 EventBridge rule: LONG_RAW.mp4 upload triggers LongVideoProcessStateMachine
new CfnRule(
  stepfunctionStack,
  "LongVideoUploadRule",
  {
    eventPattern: {
      source: ["aws.s3"],
      ["detail-type"]: ["Object Created"],
      detail: {
        bucket: {
          name: [s3Bucket.bucketName],
        },
        object: {
          key: [{ prefix: "*/" }, { suffix: "LONG_RAW.mp4" }],
        },
      },
    },
    targets: [
      {
        arn: longVideoProcessStateMachine.stateMachine.stateMachineArn,
        id: "longVideoProcessStateMachine",
        roleArn: longVideoProcessRole.roleArn,
      },
    ],
  }
);

// Generate Long Video Output Step Function
// Use the same stack as generateLongVideoOutputFunction (data stack) to avoid circular deps
const generateLongVideoOutputStack = backend.generateLongVideoOutputFunction.stack;
const generateLongVideoStateMachine = new GenerateLongVideoStateMachine(
  generateLongVideoOutputStack,
  "GenerateLongVideoStateMachine",
  {
    bucket: s3Bucket,
    longVideoEditTable: longVideoEditTable,
    longVideoSegmentTable: longVideoSegmentTable,
    longVideoOutputTable: longVideoOutputTable,
  }
);

// Wire up generateLongVideoOutput function
const generateLongVideoOutputFunc = backend.generateLongVideoOutputFunction.resources;

generateLongVideoOutputFunc.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["states:StartExecution"],
    resources: ["*"],
  }),
);

generateLongVideoOutputFunc.cfnResources.cfnFunction.environment = {
  variables: {
    STATE_MACHINE: generateLongVideoStateMachine.stateMachine.stateMachineArn,
    BUCKET_NAME: s3Bucket.bucketName,
  }
};

// Wire up YouTube upload function
// Use the same stack as uploadToYouTubeFunction (data stack) to avoid circular deps
const youtubeUploadStack = backend.uploadToYouTubeFunction.stack;
const youtubeUpload = new YouTubeUpload(youtubeUploadStack, "YouTubeUpload", {
  bucket: s3Bucket,
  longVideoOutputTable: longVideoOutputTable,
});

const uploadToYouTubeFunc = backend.uploadToYouTubeFunction.resources;

uploadToYouTubeFunc.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["lambda:InvokeFunction"],
    resources: [youtubeUpload.handler.functionArn],
  }),
);

uploadToYouTubeFunc.cfnResources.cfnFunction.environment = {
  variables: {
    YOUTUBE_UPLOAD_FUNCTION: youtubeUpload.handler.functionName,
  }
};

// Wire up suggestVideoMetadata function
const suggestVideoMetadataFunc = backend.suggestVideoMetadataFunction.resources;

suggestVideoMetadataFunc.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    resources: [
      "arn:aws:bedrock:*::foundation-model/*",
      `arn:aws:bedrock:*:${Stack.of(suggestVideoMetadataFunc.lambda).account}:inference-profile/*`,
      `arn:aws:bedrock:*:${Stack.of(suggestVideoMetadataFunc.lambda).account}:application-inference-profile/*`,
    ],
  }),
);

suggestVideoMetadataFunc.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["s3:GetObject"],
    resources: [s3Bucket.arnForObjects("*")],
  }),
);

suggestVideoMetadataFunc.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["dynamodb:GetItem"],
    resources: [longVideoEditTable.tableArn],
  }),
);

suggestVideoMetadataFunc.cfnResources.cfnFunction.environment = {
  variables: {
    BUCKET_NAME: s3Bucket.bucketName,
    LONG_VIDEO_EDIT_TABLE_NAME: longVideoEditTable.tableName,
  }
};

// Wire up exchangeYouTubeToken function
const exchangeYouTubeTokenFunc = backend.exchangeYouTubeTokenFunction.resources;

exchangeYouTubeTokenFunc.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "secretsmanager:GetSecretValue",
      "secretsmanager:PutSecretValue",
      "secretsmanager:CreateSecret",
      "secretsmanager:UpdateSecret",
    ],
    resources: ["*"],
  }),
);

// Wire up checkYouTubeConnection function
const checkYouTubeConnectionFunc = backend.checkYouTubeConnectionFunction.resources;

checkYouTubeConnectionFunc.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["secretsmanager:GetSecretValue"],
    resources: ["*"],
  }),
);
