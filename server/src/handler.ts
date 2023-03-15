import "source-map-support/register";
import serverlessExpress from "@vendia/serverless-express";
import express from "express";
import { Client, middleware, TextMessage, WebhookEvent } from "@line/bot-sdk";
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 } from "uuid";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { orderBy } from "lodash-es";

dayjs.extend(utc);
dayjs.extend(advancedFormat);

const nanoSecondFormat = "YYYY-MM-DDTHH:mm:ss.SSSSSSSSS[Z]";

const messagesTableName = "messages";

const ddbDocClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "ap-northeast-1",
  })
);

const lineBotClient = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN ?? "",
  channelSecret: process.env.CHANNEL_SECRET ?? "",
});

const openAiApi = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPEN_AI_SECRET ?? "",
  })
);

const handleEvent = async (event: WebhookEvent) => {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId!;
  const userMessageContent = event.message.text;
  // Stores the user's statement history
  await ddbDocClient.send(
    new PutCommand({
      TableName: messagesTableName,
      Item: {
        id: v4(),
        content: userMessageContent,
        userId: userId,
        typedAt: dayjs().format(nanoSecondFormat),
        role: "user",
      },
    })
  );

  // Obtains a history of the user's previous statements during a conversation
  const { Items: messages = [] } = await ddbDocClient.send(
    new QueryCommand({
      TableName: messagesTableName,
      IndexName: "userIdIndex",
      KeyConditionExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    })
  );

  // Sort chronologically
  const queriedMessages: ChatCompletionRequestMessage[] = orderBy(
    messages,
    "typedAt",
    "asc"
  ).map(
    (message) =>
      ({
        role: message.role,
        content: message.content,
      } as ChatCompletionRequestMessage)
  );

  // Send the conversation history between the user and ChatGPT to ChatGPT API and get a response.
  const completion = await openAiApi.createChatCompletion({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content:
          "あなたは「JOJI」です。名前を聞かれたら、「JOJIくん」と答えてください。web3スタートアップのエンジニア担当をしています。",
      },
      {
        role: "system",
        content:
          "敬語を使うのをやめてください。また、絵文字をたくさん使って話してください。相手をできるだけ褒めてください。",
      },
    ].concat(queriedMessages) as ChatCompletionRequestMessage[],
  });

  const chatGptMessageContent = completion.data.choices[0].message?.content!;
  // Save ChatGPT remarks
  await ddbDocClient.send(
    new PutCommand({
      TableName: messagesTableName,
      Item: {
        id: v4(),
        content: chatGptMessageContent,
        userId: userId,
        typedAt: dayjs().format(nanoSecondFormat),
        role: "assistant",
      },
    })
  );

  // Using LINE MessagingAPI with ChatGPT statements as parameters
  const repliedMessage: TextMessage = {
    type: "text",
    text: chatGptMessageContent,
  };
  return lineBotClient.replyMessage(event.replyToken, repliedMessage);
};

const app = express();
app.use(
  // Signature verification + JSON parsing middleware
  middleware({
    channelSecret: process.env.CHANNEL_SECRET ?? "",
  })
);

app.post("/webhook", async (req, res) => {
  try {
    const events: WebhookEvent[] = req.body.events;

    const results = await Promise.all(events.map(handleEvent));
    return res.json(results);
  } catch (err) {
    console.error(err);
    return res.status(500);
  }
});

export default app;

export const handler = serverlessExpress({ app });
