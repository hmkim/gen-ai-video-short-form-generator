import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { GenerateLongVideoOutput } from '../resource';
import { Role, ServicePrincipal, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';

type GenerateLongVideoStateMachineProps = {
  bucket: IBucket,
  longVideoEditTable: ITable,
  longVideoSegmentTable: ITable,
  longVideoOutputTable: ITable,
};

export class GenerateLongVideoStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: GenerateLongVideoStateMachineProps) {
    super(scope, id);

    const mediaConvertRole = new Role(this, 'MediaConvertRole', {
      assumedBy: new ServicePrincipal('mediaconvert.amazonaws.com'),
    });
    mediaConvertRole.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonAPIGatewayInvokeFullAccess'
    });
    mediaConvertRole.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess'
    });

    // Lambda
    const generateLongVideoOutput = new GenerateLongVideoOutput(this, "GenerateLongVideoOutputFunc", {
      bucket: props.bucket,
      longVideoEditTable: props.longVideoEditTable,
      longVideoSegmentTable: props.longVideoSegmentTable,
      longVideoOutputTable: props.longVideoOutputTable,
    });

    // Helper functions
    const updateDDB = (stage: number) => {
      return new tasks.DynamoUpdateItem(this, `UpdateDDBStage${stage}`, {
        table: props.longVideoEditTable,
        key: { id: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.videoId")) },
        updateExpression: "SET stage = :val",
        expressionAttributeValues: { ":val": tasks.DynamoAttributeValue.fromNumber(stage) },
        resultPath: sfn.JsonPath.DISCARD
      });
    };

    const updateEvent = (stage: number) => {
      return new tasks.EventBridgePutEvents(this, `UpdateEventStage${stage}`, {
        entries: [{
          detail: sfn.TaskInput.fromObject({
            "videoId": sfn.JsonPath.stringAt("$.videoId"),
            "stage": stage
          }),
          detailType: "LongVideoStageChanged",
          source: "custom.aws-shorts"
        }],
        resultPath: sfn.JsonPath.DISCARD
      });
    };

    // Definition
    const prepareParameters = new sfn.Pass(this, 'PrepareParameters', {
      parameters: {
        "videoId.$": "$.videoId",
        "presenterNumber.$": "$.presenterNumber",
        "title.$": "$.title",
        "description.$": "$.description",
        "bucket_name.$": "$.bucket_name",
      },
    });

    const generateOutputTask = new tasks.LambdaInvoke(this, 'GenerateLongVideoOutput', {
      lambdaFunction: generateLongVideoOutput.handler,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultSelector: {
        "template.$": "States.StringToJson($.Payload.body)",
      },
      resultPath: "$.result"
    });

    const mediaConvertJob = new tasks.MediaConvertCreateJob(this, 'MediaConvertLongVideoJob', {
      createJobRequest: {
        "Role": mediaConvertRole.roleArn,
        "Settings": {
          "TimecodeConfig": {
            "Source": "ZEROBASED"
          },
          "Inputs": [
            {
              "FileInput.$": "$.result.template.input_file",
              "AudioSelectors": {
                "Audio Selector 1": {
                  "DefaultSelection": "DEFAULT"
                }
              },
              "VideoSelector": {},
              "TimecodeSource": "ZEROBASED",
              "InputClippings.$": "$.result.template.input_clippings"
            }
          ],
          "OutputGroups": [
            {
              "Name": "FileGroup",
              "Outputs": [
                {
                  "ContainerSettings": {
                    "Container": "MP4",
                    "Mp4Settings": {}
                  },
                  "VideoDescription": {
                    "Width": 1920,
                    "ScalingBehavior": "DEFAULT",
                    "Height": 1080,
                    "CodecSettings": {
                      "Codec": "H_264",
                      "H264Settings": {
                        "FramerateDenominator": 1,
                        "MaxBitrate": 5000000,
                        "FramerateControl": "SPECIFIED",
                        "RateControlMode": "QVBR",
                        "FramerateNumerator": 25,
                        "SceneChangeDetect": "TRANSITION_DETECTION"
                      }
                    }
                  },
                  "AudioDescriptions": [
                    {
                      "CodecSettings": {
                        "Codec": "AAC",
                        "AacSettings": {
                          "Bitrate": 96000,
                          "CodingMode": "CODING_MODE_2_0",
                          "SampleRate": 48000
                        }
                      }
                    }
                  ]
                }
              ],
              "OutputGroupSettings": {
                "Type": "FILE_GROUP_SETTINGS",
                "FileGroupSettings": {
                  "Destination.$": "$.result.template.output_destination"
                }
              }
            }
          ]
        }
      },
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const definitionBody = prepareParameters
      .next(updateDDB(4))
      .next(updateEvent(4))
      .next(generateOutputTask)
      .next(mediaConvertJob)
      .next(updateDDB(5))
      .next(updateEvent(5))

    this.stateMachine = new sfn.StateMachine(this, 'GenerateLongVideoStateMachine', {
      comment: "A Step Function to generate long video output per presenter",
      definitionBody: sfn.DefinitionBody.fromChainable(definitionBody),
    });
  }
}
