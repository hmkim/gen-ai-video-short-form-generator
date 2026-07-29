import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib/core';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam'

import { DetectPresenterBoundaries, AnalyzePresenterSegments, AnalyzeVideoFrames } from '../resource';

type LongVideoProcessStateMachineProps = {
  bucket: IBucket,
  longVideoEditTable: ITable,
  longVideoSegmentTable: ITable
};

export class LongVideoProcessStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: LongVideoProcessStateMachineProps) {
    super(scope, id);

    // Lambda functions
    const detectPresenterBoundaries = new DetectPresenterBoundaries(this, "DetectPresenterBoundariesFunc", {
      bucket: props.bucket,
      longVideoEditTable: props.longVideoEditTable,
      longVideoSegmentTable: props.longVideoSegmentTable,
    });

    const analyzePresenterSegments = new AnalyzePresenterSegments(this, "AnalyzePresenterSegmentsFunc", {
      bucket: props.bucket,
      longVideoEditTable: props.longVideoEditTable,
      longVideoSegmentTable: props.longVideoSegmentTable,
    });

    // U5 (F5b): Vision opt-in frame analyzer. Instantiated inside this construct
    // (StepFunctionStack) so the ARN reference to the custom Lambda is one-way
    // (StepFunctionStack -> Lambda), avoiding a cross-stack cycle — same pattern
    // as AnalyzePresenterSegments above.
    const analyzeVideoFrames = new AnalyzeVideoFrames(this, "AnalyzeVideoFramesFunc", {
      bucket: props.bucket,
    });

    // Helper functions
    const updateDDB = (stage: number) => {
      return new tasks.DynamoUpdateItem(this, `UpdateDDBStage${stage}`, {
        table: props.longVideoEditTable,
        key: { id: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.uuid")) },
        updateExpression: "SET stage = :val",
        expressionAttributeValues: { ":val": tasks.DynamoAttributeValue.fromNumber(stage) },
        resultPath: sfn.JsonPath.DISCARD
      });
    };

    const updateEvent = (stage: number) => {
      return new tasks.EventBridgePutEvents(this, `UpdateEventStage${stage}`, {
        entries: [{
          detail: sfn.TaskInput.fromObject({
            "videoId": sfn.JsonPath.stringAt("$.uuid"),
            "stage": stage
          }),
          detailType: "LongVideoStageChanged",
          source: "custom.aws-shorts"
        }],
        resultPath: sfn.JsonPath.DISCARD
      });
    };

    // Step Functions definition
    const prepareParameters = new sfn.Pass(this, 'PrepareParameters', {
      parameters: {
        "uuid.$": "States.Format('{}', States.ArrayGetItem(States.StringSplit($.detail.object.key, '/'), 1))",
        "TranscriptionJobName.$": "States.Format('{}_longvideo', States.ArrayGetItem(States.StringSplit($.detail.object.key, '/'), 1))",
        "raw_file_uri.$": "States.Format('s3://{}/{}', $.detail.bucket.name, $.detail.object.key)",
        "bucket_name.$": "$.detail.bucket.name",
        "OutputKey.$": "States.Format('videos/{}/LongVideoTranscript.json', States.ArrayGetItem(States.StringSplit($.detail.object.key, '/'), 1))"
      }
    });

    // Get owner from LongVideoEdit table
    const getEditRecord = new tasks.DynamoGetItem(this, 'GetEditRecord', {
      table: props.longVideoEditTable,
      key: { id: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.uuid")) },
      resultPath: "$.editInfo"
    });

    // Start Transcription with speaker diarization
    const startTranscriptionJob = new tasks.CallAwsService(this, 'StartTranscriptionJob', {
      service: 'transcribe',
      action: 'startTranscriptionJob',
      iamAction: 'transcribe:StartTranscriptionJob',
      iamResources: ['*'],
      parameters: {
        "TranscriptionJobName.$": "$.TranscriptionJobName",
        "Media": { "MediaFileUri.$": "$.raw_file_uri" },
        "OutputBucketName.$": "$.bucket_name",
        "OutputKey.$": "$.OutputKey",
        "LanguageOptions": ["en-US", "ko-KR"],
        "IdentifyLanguage": true,
        "Subtitles": {
          "Formats": ["vtt"],
          "OutputStartIndex": 1
        },
        "Settings": {
          "ShowSpeakerLabels": true,
          "MaxSpeakerLabels": 10
        }
      },
      resultPath: sfn.JsonPath.DISCARD
    });

    const waitForTranscriptionJob = new sfn.Wait(this, 'WaitForTranscriptionJob', {
      time: sfn.WaitTime.duration(Duration.seconds(10))
    });

    const getTranscriptionJobStatus = new tasks.CallAwsService(this, 'GetTranscriptionJobStatus', {
      service: 'transcribe',
      action: 'getTranscriptionJob',
      iamAction: 'transcribe:GetTranscriptionJob',
      iamResources: ['*'],
      parameters: { "TranscriptionJobName.$": "$.TranscriptionJobName" },
      resultPath: "$.jobStatus"
    });

    const checkTranscriptionJobStatus = new sfn.Choice(this, 'CheckTranscriptionJobStatus');

    // Detect presenter boundaries
    const detectBoundariesTask = new tasks.LambdaInvoke(this, 'DetectPresenterBoundaries', {
      lambdaFunction: detectPresenterBoundaries.handler,
      payload: sfn.TaskInput.fromObject({
        "uuid.$": "$.uuid",
        "bucket_name.$": "$.bucket_name",
        "owner.$": "$.editInfo.Item.owner.S",
        "presenterCount.$": "$.editInfo.Item.presenterCount.N",
        "timestamp.$": "$$.State.EnteredTime"
      }),
      resultSelector: {
        "segments.$": "$.Payload.segments",
        "boundaries.$": "$.Payload.boundaries",
        "speaker_map.$": "$.Payload.speaker_map",
        "speech_ratio_metadata.$": "$.Payload.speech_ratio_metadata",
        "presenterCount.$": "$.Payload.presenterCount"
      },
      resultPath: "$.boundaryResult"
    });

    // Analyze presenter segments with Bedrock
    const analyzeSegmentsTask = new tasks.LambdaInvoke(this, 'AnalyzePresenterSegments', {
      lambdaFunction: analyzePresenterSegments.handler,
      payload: sfn.TaskInput.fromObject({
        "uuid.$": "$.uuid",
        "bucket_name.$": "$.bucket_name",
        "segments.$": "$.boundaryResult.segments",
        "boundaries.$": "$.boundaryResult.boundaries",
        "speech_ratio_metadata.$": "$.boundaryResult.speech_ratio_metadata",
        "presenterCount.$": "$.boundaryResult.presenterCount",
        // U5 (F5b): visual_analysis is [] on the OFF/degraded path (set by the
        // NoVisionAnalysis Pass) and populated on the ON path. The Lambda is
        // backward-compatible and treats [] as "no visual hints".
        "visual_analysis.$": "$.visionResult.visual_analysis"
      }),
      resultPath: "$.analysisResult"
    });

    // U5 (F5b): Vision frame-analysis task. Retries transient Lambda errors,
    // and on any failure Catches to the audio-only path (graceful degrade).
    const analyzeVideoFramesTask = new tasks.LambdaInvoke(this, 'AnalyzeVideoFrames', {
      lambdaFunction: analyzeVideoFrames.handler,
      payload: sfn.TaskInput.fromObject({
        "uuid.$": "$.uuid",
        "bucket_name.$": "$.bucket_name",
        "segments.$": "$.boundaryResult.segments",
        "boundaries.$": "$.boundaryResult.boundaries",
        "speech_ratio_metadata.$": "$.boundaryResult.speech_ratio_metadata",
        "presenterCount.$": "$.boundaryResult.presenterCount"
      }),
      resultSelector: {
        "visual_analysis.$": "$.Payload.visual_analysis"
      },
      resultPath: "$.visionResult"
    });

    // OFF / graceful-degrade path: inject an empty visual_analysis so the
    // downstream AnalyzePresenterSegments input path always resolves.
    const noVisionAnalysis = new sfn.Pass(this, 'NoVisionAnalysis', {
      result: sfn.Result.fromObject({ visual_analysis: [] }),
      resultPath: "$.visionResult"
    });

    analyzeVideoFramesTask.addRetry({
      errors: [
        'Lambda.ServiceException',
        'Lambda.AWSLambdaException',
        'Lambda.SdkClientException',
        'Lambda.TooManyRequestsException'
      ],
      interval: Duration.seconds(2),
      maxAttempts: 2,
      backoffRate: 2
    });
    // Any unhandled failure -> degrade to the audio-only path (pipeline not blocked).
    analyzeVideoFramesTask.addCatch(noVisionAnalysis, {
      errors: ['States.ALL'],
      resultPath: "$.visionError"
    });

    // Choice: only analyze frames when the edit record opted in (visionEnabled=true).
    // isPresent guards records created before this field existed (treated as OFF).
    const visionChoice = new sfn.Choice(this, 'IsVisionEnabled');

    const sharedUpdateDDB1 = updateDDB(1);

    // Definition body
    const definitionBody = prepareParameters
      .next(getEditRecord)
      .next(startTranscriptionJob)
      .next(waitForTranscriptionJob)
      .next(getTranscriptionJobStatus)
      .next(checkTranscriptionJobStatus
        .when(sfn.Condition.stringEquals("$.jobStatus.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"), sharedUpdateDDB1)
        .when(sfn.Condition.stringEquals("$.jobStatus.TranscriptionJob.TranscriptionJobStatus", "FAILED"),
          new sfn.Fail(this, 'TranscriptionJobFailed', {
            cause: "Transcription job failed",
            error: "TranscriptionJobFailed"
          })
        )
        .otherwise(waitForTranscriptionJob)
      )

    sharedUpdateDDB1
      .next(updateEvent(1))
      .next(detectBoundariesTask)
      .next(visionChoice)

    // U5 (F5b): branch on visionEnabled, then both paths converge on segment analysis.
    visionChoice
      .when(
        sfn.Condition.and(
          sfn.Condition.isPresent("$.editInfo.Item.visionEnabled.BOOL"),
          sfn.Condition.booleanEquals("$.editInfo.Item.visionEnabled.BOOL", true)
        ),
        analyzeVideoFramesTask
      )
      .otherwise(noVisionAnalysis);

    analyzeVideoFramesTask.next(analyzeSegmentsTask);
    noVisionAnalysis.next(analyzeSegmentsTask);

    analyzeSegmentsTask
      .next(updateDDB(2))
      .next(updateEvent(2))

    // Create role for the state machine
    const stateMachineRole = new Role(this, 'LongVideoProcessStateMachineRole', {
      assumedBy: new ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        'StateMachineExecutionPolicy': new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem', 'dynamodb:PutItem', 'dynamodb:BatchWriteItem'],
              resources: [props.longVideoEditTable.tableArn, props.longVideoSegmentTable.tableArn]
            }),
            new PolicyStatement({
              actions: ['s3:GetObject', 's3:PutObject', 's3:HeadObject'],
              resources: [
                `${props.bucket.bucketArn}/*`,
                props.bucket.bucketArn
              ]
            }),
            new PolicyStatement({
              actions: [
                'transcribe:StartTranscriptionJob',
                'transcribe:GetTranscriptionJob'
              ],
              resources: ['*']
            }),
            new PolicyStatement({
              actions: ['events:PutEvents'],
              resources: ['*']
            }),
            new PolicyStatement({
              actions: ['lambda:InvokeFunction'],
              resources: ['*']
            }),
          ]
        })
      }
    });

    this.stateMachine = new sfn.StateMachine(this, 'LongVideoProcessStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definitionBody),
      comment: "A Step Function to process long video with speaker diarization",
      role: stateMachineRole
    });
  }
}
