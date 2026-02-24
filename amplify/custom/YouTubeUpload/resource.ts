import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Duration } from 'aws-cdk-lib/core';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

type YouTubeUploadProps = {
  bucket: IBucket,
  longVideoOutputTable: ITable,
};

export class YouTubeUpload extends Construct {
  public readonly handler: Function;
  constructor(scope: Construct, id: string, props: YouTubeUploadProps) {
    super(scope, id);

    this.handler = new Function(this, 'YouTubeUpload', {
      runtime: Runtime.PYTHON_3_12,
      code: Code.fromAsset('amplify/custom/lambda-functions/youtube-upload'),
      handler: 'lambda_function.lambda_handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        LONG_VIDEO_OUTPUT_TABLE_NAME: props.longVideoOutputTable.tableName,
      },
      timeout: Duration.seconds(900),
      memorySize: 1024
    });

    props.bucket.grantRead(this.handler);
    props.longVideoOutputTable.grantReadWriteData(this.handler);
    this.handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: ["*"],
        actions: [
          "secretsmanager:GetSecretValue",
        ],
      })
    );
  }
}
