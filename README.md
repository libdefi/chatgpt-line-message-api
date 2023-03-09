# ChatGPT API LINE Bot AWS Serverless
It it a LINE bot utilizing ChatGPT with AWS serverless stack and DynamoDB.

## Prerequisites
Node.js 18.x
npm 9.x
Volta

## What you should prepare

- LINE developer account
- Open AI account (*Credit card registration is required)
- AWS account (*Credit card registration is required)

## Before Deploy
Manually register the following three environment variables with AWS.
Go to "AWS Systems Manager" > "Parameter Store" to register environment variables.
- lineMessagingApiChannelSecret
- lineMessagingApiChannelAccessToken
- openAiSecret

## Deploy
```
git clone https://github.com/dyoshikawa/chatgpt-api-line-bot-aws-serverless
cd chatgpt-api-line-bot-aws-serverless
npm i 
npm run cdk -w iac -- deploy
```

## After deploy
Go to the LINE administration page, allow the use of webhooks, and set the Endpoint URL.
"Add Endpoint" + "/webhook" to the URL.
