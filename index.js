const config     = require('./config');
const express    = require('express');
const bodyParser = require('body-parser');
const twilio     = require('twilio');

const OpenAI = require('openai-api');
const openai = new OpenAI(config.openai.apiKey);

const app = new express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.post('/token/:identity', (request, response) => {
  const identity = request.params.identity;
  const accessToken = new twilio.jwt.AccessToken(config.twilio.accountSid, config.twilio.apiKey, config.twilio.apiSecret);
  const chatGrant = new twilio.jwt.AccessToken.ChatGrant({
    serviceSid: config.twilio.chatServiceSid,
  });
  accessToken.addGrant(chatGrant);
  accessToken.identity = identity;
  response.set('Content-Type', 'application/json');
  response.send(JSON.stringify({
    token: accessToken.toJwt(),
    identity: identity
  }));
})

app.listen(config.port, () => {
  console.log(`Application started at localhost:${config.port}`);
});


// ============================================
// ============================================
// ====== HANDLE NEW-CONVERSATION HOOK ========
// ============================================
// ============================================
let client = new twilio(config.twilio.accountSid, config.twilio.authToken);

// create a new conversation and add the user to the conversation
client.conversations.conversations.create({friendlyName: 'OpenAI ML Test'}).then((conversation) => {
  console.log(`Created new conversation: ${conversation.sid}`);

  client.conversations.conversations(conversation.sid).participants.create({identity: 'mlaccetti'}).then(participant => {
    console.log(`Added participant ${participant.sid} to conversation`);
  });
}).catch((error) => {
  console.error(`Could not create conversation or add participant: ${error}`);
});

app.post('/chat', (req, res) => {
  console.log("Received a webhook:", req.body);
  if (req.body.EventType === 'onConversationAdded') {
    const me = "Tackleton";
    client.conversations.v1.conversations(req.body.ConversationSid)
      .participants
      .create({
          identity: me
        })
      .then(participant => console.log(`Added ${participant.identity} to ${req.body.ConversationSid}.`))
      .catch(err => console.error(`Failed to add a member to ${req.body.ConversationSid}!`, err));
  }

  console.log("(200 OK!)");
  res.sendStatus(200);
});

app.post('/outbound-status', (req, res) => {
  console.log(`Message ${req.body.SmsSid} to ${req.body.To} is ${req.body.MessageStatus}`);
  res.sendStatus(200);
});

app.post('/callback', (req, res) => {
  console.log("Received a webhook:", req.body);
  if (req.body.EventType === 'onMessageSent') {
    console.log('Received a message, sending to OpenAI.');

    openai.complete({
      engine: 'curie',
      prompt: `Read this customer message and then answer the following questions:

      """
      ${req.body.Body}
      """
      
      Questions:
      1. Did the customer have a complaint?
      2. Was the customer polite?
      3. Did the customer need additional help?
      
      Answers:
      1. `,
      maxTokens: 64,
      temperature: 0.2,
      topP: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      best_of: 1,
      n: 1,
      stream: false,
      stop: ['\n\n']
    }).then((gptResponse) => {
      console.log(gptResponse.data);
      console.log("(200 OK!)");
      res.sendStatus(200);
    });
  }
});