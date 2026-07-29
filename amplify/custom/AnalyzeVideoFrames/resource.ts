import { Code, Function, Runtime, LayerVersion, IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Duration, Stack, Size } from 'aws-cdk-lib/core';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

type AnalyzeVideoFramesProps = {
  bucket: IBucket,
};

/**
 * U5 (F5b) — Vision opt-in.
 *
 * Extracts frames at speaker-transition boundaries (FFmpeg layer) and runs
 * Bedrock Vision over them. Only invoked by LongVideoProcessStateMachine when
 * the edit record's `visionEnabled` flag is true. Heavier than the audio-only
 * Lambdas (2048MB + 2048MB ephemeral) because FFmpeg frame extraction is
 * memory/disk bound. See infrastructure-design.md / improvement-plan §9.3.
 */
export class AnalyzeVideoFrames extends Construct {
  public readonly handler: IFunction;
  constructor(scope: Construct, id: string, props: AnalyzeVideoFramesProps) {
    super(scope, id);

    // FFmpeg static binary layer. The binary itself is NOT committed — see
    // amplify/custom/lambda-layers/ffmpeg/README.md for provenance and the
    // bin/ffmpeg placement requirement. Lambda mounts layers under /opt, so the
    // handler invokes /opt/bin/ffmpeg.
    const ffmpegLayer = new LayerVersion(this, 'FfmpegLayer', {
      code: Code.fromAsset('amplify/custom/lambda-layers/ffmpeg'),
      compatibleRuntimes: [Runtime.PYTHON_3_12],
      description: 'FFmpeg static binary (linux-x86_64) for frame extraction',
    });

    this.handler = new Function(this, 'AnalyzeVideoFrames', {
      runtime: Runtime.PYTHON_3_12,
      code: Code.fromAsset('amplify/custom/lambda-functions/analyze-video-frames'),
      handler: 'lambda_function.lambda_handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
      },
      timeout: Duration.seconds(600),
      memorySize: 2048,
      ephemeralStorageSize: Size.mebibytes(2048),
      layers: [ffmpegLayer],
    });

    // S3: GetObject scoped to the video prefix only (presigned URL generation +
    // the FFmpeg fetch over that presigned URL both require GetObject).
    this.handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [props.bucket.arnForObjects('videos/*')],
      })
    );

    // Bedrock Vision: provider-scoped ARNs (matches AnalyzePresenterSegments).
    this.handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:*:${Stack.of(this).account}:inference-profile/*`,
          `arn:aws:bedrock:*:${Stack.of(this).account}:application-inference-profile/*`,
        ],
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
      })
    );
  }
}
