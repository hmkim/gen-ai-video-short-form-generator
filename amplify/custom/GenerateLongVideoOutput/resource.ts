import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Duration } from 'aws-cdk-lib/core';

type GenerateLongVideoOutputProps = {
  bucket: IBucket,
  longVideoEditTable: ITable,
  longVideoSegmentTable: ITable,
  longVideoOutputTable: ITable,
};

export class GenerateLongVideoOutput extends Construct {
  public readonly handler: Function;
  constructor(scope: Construct, id: string, props: GenerateLongVideoOutputProps) {
    super(scope, id);

    this.handler = new Function(this, 'GenerateLongVideoOutput', {
      runtime: Runtime.PYTHON_3_12,
      code: Code.fromAsset('amplify/custom/lambda-functions/generate-long-video-output'),
      handler: 'lambda_function.lambda_handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        LONG_VIDEO_EDIT_TABLE_NAME: props.longVideoEditTable.tableName,
        LONG_VIDEO_SEGMENT_TABLE_NAME: props.longVideoSegmentTable.tableName,
        LONG_VIDEO_OUTPUT_TABLE_NAME: props.longVideoOutputTable.tableName,
      },
      timeout: Duration.seconds(600),
      memorySize: 512
    });

    props.bucket.grantReadWrite(this.handler);
    props.longVideoEditTable.grantReadWriteData(this.handler);
    props.longVideoSegmentTable.grantReadWriteData(this.handler);
    props.longVideoOutputTable.grantReadWriteData(this.handler);
  }
}
