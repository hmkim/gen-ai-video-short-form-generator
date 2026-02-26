import { type ClientSchema, a, defineData, defineFunction } from '@aws-amplify/backend';

const publishHandler = defineFunction({
  entry: "./publish.js"
})

const publishLongVideoHandler = defineFunction({
  entry: "./publishLongVideo.js"
})

export const generateShortFunction = defineFunction({
  entry: "./generateShort.ts",
  resourceGroupName: "data"
});

export const generateLongVideoOutputFunction = defineFunction({
  entry: "./generateLongVideoOutput.ts",
  resourceGroupName: "data"
});

export const uploadToYouTubeFunction = defineFunction({
  entry: "./uploadToYouTube.ts",
  resourceGroupName: "data"
});

export const suggestVideoMetadataFunction = defineFunction({
  entry: "./suggestVideoMetadata.ts",
  resourceGroupName: "data",
  timeoutSeconds: 120,
});

export const exchangeYouTubeTokenFunction = defineFunction({
  entry: "./exchangeYouTubeToken.ts",
  resourceGroupName: "data",
  timeoutSeconds: 30,
});

export const checkYouTubeConnectionFunction = defineFunction({
  entry: "./checkYouTubeConnection.ts",
  resourceGroupName: "data",
  timeoutSeconds: 15,
});

export const saveYouTubeChannelFunction = defineFunction({
  entry: "./saveYouTubeChannel.ts",
  resourceGroupName: "data",
  timeoutSeconds: 10,
});

const schema = a.schema({
  History: a
    .model({
      videoName: a.string().required(),
      modelID: a.string().required(),
      shortified: a.boolean().required(),
      stage: a.integer().required(),
      galleries: a.hasMany("Gallery", "historyId"),
      numberOfVideos: a.integer().required(),
      theme: a.string().required(),
      videoLength: a.integer().required(),
    })
    .authorization((allow) => [allow.owner()]),

  Highlight: a.model({
    VideoName: a.string().required(),
    Index: a.string().required(),
    duration: a.integer(),
    Question: a.string(),
    Text: a.string(),
  })
  .identifier(['VideoName', "Index"])
  .authorization((allow) => [allow.owner()]),

  Gallery: a.model({
    historyId: a.id().required(),
    highlightId: a.id().required(),
    location: a.string().required(),
    question: a.string(),
    text: a.string(),
    history: a.belongsTo('History', 'historyId'),
    type: a.string().default("gallery"),
    createdAt: a.string()
  })
  .secondaryIndexes((index) => [index('type').sortKeys(['createdAt'])])
  .authorization((allow) => [allow.authenticated()]),

  // Long Video Edit models
  LongVideoEdit: a
    .model({
      videoName: a.string().required(),
      modelID: a.string().required(),
      stage: a.integer().required(),
      presenter1Name: a.string().default("Presenter 1"),
      presenter2Name: a.string().default("Presenter 2"),
      segments: a.hasMany("LongVideoSegment", "longVideoEditId"),
      outputs: a.hasMany("LongVideoOutput", "longVideoEditId"),
    })
    .authorization((allow) => [allow.owner()]),

  LongVideoSegment: a
    .model({
      longVideoEditId: a.id().required(),
      startTime: a.float().required(),
      endTime: a.float().required(),
      speakerLabel: a.string(),
      segmentType: a.string().required(),
      includeInOutput: a.boolean().default(true),
      aiConfidence: a.float(),
      longVideoEdit: a.belongsTo("LongVideoEdit", "longVideoEditId"),
    })
    .authorization((allow) => [allow.owner()]),

  LongVideoOutput: a
    .model({
      longVideoEditId: a.id().required(),
      presenterNumber: a.integer().required(),
      s3Location: a.string(),
      youtubeVideoId: a.string(),
      title: a.string(),
      description: a.string(),
      tags: a.string(),
      uploadStatus: a.string(), // 'uploading' | 'completed' | 'failed' | 'cancelled'
      uploadError: a.string(),
      uploadStartedAt: a.string(),
      longVideoEdit: a.belongsTo("LongVideoEdit", "longVideoEditId"),
    })
    .authorization((allow) => [allow.owner()]),

  StageChanged: a.customType({
    videoId: a.string().required(),
    stage: a.integer().required(),
  }),

  LongVideoStageChanged: a.customType({
    videoId: a.string().required(),
    stage: a.integer().required(),
  }),

  publish: a.mutation()
    .arguments({
      videoId: a.string().required(),
      stage: a.integer().required()
    })
    .returns(a.ref("StageChanged"))
    .authorization((allow) => [allow.authenticated(), allow.guest()])
    .handler(a.handler.function(publishHandler)),

  receive: a.subscription()
    .for(a.ref('publish'))
    .arguments({
      videoId: a.string().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.custom({entry: './receive.js'})),

  publishLongVideo: a.mutation()
    .arguments({
      videoId: a.string().required(),
      stage: a.integer().required()
    })
    .returns(a.ref("LongVideoStageChanged"))
    .authorization((allow) => [allow.authenticated(), allow.guest()])
    .handler(a.handler.function(publishLongVideoHandler)),

  receiveLongVideo: a.subscription()
    .for(a.ref('publishLongVideo'))
    .arguments({
      videoId: a.string().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.custom({entry: './receiveLongVideo.js'})),

  ShortsInput: a.customType({
    CropHeight: a.integer(),
    CropWidth: a.integer(),
    SectionDuration: a.float(),
    Xoffset: a.float(),
    Yoffset: a.float(),
  }),

  generateShort: a.query()
    .arguments({
      inputs: a.string().required(),
      videoId: a.string().required(),
      highlight: a.integer().required(),
      question: a.string().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateShortFunction)),

  generateLongVideoOutput: a.query()
    .arguments({
      videoId: a.string().required(),
      presenterNumber: a.integer().required(),
      title: a.string(),
      description: a.string(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateLongVideoOutputFunction)),

  uploadToYouTube: a.query()
    .arguments({
      outputId: a.string().required(),
      title: a.string().required(),
      description: a.string(),
      tags: a.string(),
      playlistName: a.string(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(uploadToYouTubeFunction)),

  suggestVideoMetadata: a.query()
    .arguments({
      videoId: a.string().required(),
      presenterNumber: a.integer().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(suggestVideoMetadataFunction)),

  exchangeYouTubeToken: a.query()
    .arguments({
      code: a.string().required(),
      redirectUri: a.string().required(),
      clientId: a.string().required(),
      clientSecret: a.string().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(exchangeYouTubeTokenFunction)),

  checkYouTubeConnection: a.query()
    .arguments({})
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(checkYouTubeConnectionFunction)),

  saveYouTubeChannel: a.query()
    .arguments({
      channelId: a.string().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(saveYouTubeChannelFunction)),

});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  name: "AWS-Shorts",
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
