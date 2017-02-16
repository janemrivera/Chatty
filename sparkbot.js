'use strict';

const apiai = require('apiai');
const uuid = require('uuid');
const request = require('request');
const async = require('async');

module.exports = class SparkBot {

    get apiaiService() {
        return this._apiaiService;
    }

    set apiaiService(value) {
        this._apiaiService = value;
    }

    get botConfig() {
        return this._botConfig;
    }

    set botConfig(value) {
        this._botConfig = value;
    }

    get sessionIds() {
        return this._sessionIds;
    }

    set sessionIds(value) {
        this._sessionIds = value;
    }

    constructor(botConfig, webhookUrl) {
        this._botConfig = botConfig;
        var apiaiOptions = {
            language: botConfig.apiaiLang,
            requestSource: "spark"
        };

        this._apiaiService = apiai(botConfig.apiaiAccessToken, apiaiOptions);
        this._sessionIds = new Map();

        this._webhookUrl = webhookUrl;
        console.log('Starting bot on ' + this._webhookUrl);

        this.loadProfile()
            .then((profile) => {
                if (profile.displayName) {
                    this._botName = profile.displayName.replace("(bot)", "").trim();
                    if (this._botName.includes(" ")) {
                        this._shortName = this._botName.substr(0, this._botName.indexOf(" "));
                    } else {
                        this._shortName = null;
                    }

                    console.log("BotName:", this._botName);
                    console.log("ShortName:", this._shortName);
                }
            });
    }

    setupWebhook() {
        // https://developer.ciscospark.com/endpoint-webhooks-post.html

        /*
        request.post("https://api.ciscospark.com/v1/webhooks",
            {
                auth: {
                    bearer: this._botConfig.sparkToken
                },
                json: {
                    event: "created",
                    name: "BotWebhook",
                    resource: "messages",
                    targetUrl: this._webhookUrl
                }
            }, (err, resp) => {
                if (err) {
                    console.error("Error while setup webhook", err);
                    return;
                }

                if (resp.statusCode > 200) {
                    let message = resp.statusMessage;
                    if (resp.body && resp.body.message) {
                        message += ", " + resp.body.message;
                    }
                    console.error("Error while setup webhook", message);
                    return;
                }

                console.log("Webhook result", resp.body);
                this._botConfig.webhookId = resp.body.id;
            });
            */
            this._botConfig.webhookId = 'Y2lzY29zcGFyazovL3VzL1dFQkhPT0svOTA5NDlmOWQtNmJhMy00ODY1LWFjNmMtNmQ3NDA2OTc4NDE0';
    }

    deleteWebhook() {
        if (this._botConfig.webhookId) {
            return new Promise((resolve, reject) => {
                request.del("https://api.ciscospark.com/v1/webhooks/" + this._botConfig.webhookId,
                    {
                        auth: {
                            bearer: this._botConfig.sparkToken
                        }
                    },
                    (err, resp) => {
                        if (err) {
                            console.error("Error while setup webhook", err);
                            reject(err);
                        } else if (resp.statusCode > 204) {
                            let message = resp.statusMessage;
                            if (resp.body && resp.body.message) {
                                message += ", " + resp.body.message;
                            }
                            console.error("Error while setup webhook", message);
                            reject(new Error(message));
                        } else {
                            console.log("deleteWebhook result", resp.body);
                            resolve();
                        }
                    });
            });

        } else {
            return Promise.resolve();
        }

    }

    loadProfile() {
        return new Promise((resolve, reject) => {
            request.get("https://api.ciscospark.com/v1/people/me",
                {
                    auth: {
                        bearer: this._botConfig.sparkToken
                    }
                }, (err, resp, body) => {
                    if (err) {
                        console.error('Error while reply:', err);
                        reject(err);
                    } else if (resp.statusCode != 200) {
                        console.log('LoadMessage error:', resp.statusCode, body);
                        reject('LoadMessage error: ' + body);
                    } else {

                        if (this._botConfig.devConfig) {
                            console.log("profile", body);
                        }

                        let result = JSON.parse(body);
                        resolve(result);
                    }
                });
        });
    }

    /**
     Process message from Spark
     details here https://developer.ciscospark.com/webhooks-explained.html
     */
    processMessage(req, res) {
        if (this._botConfig.devConfig) {
            console.log("body", req.body);
        }

        let updateObject = req.body;
        if (updateObject.resource == "messages" &&
            updateObject.data &&
            updateObject.data.id) {

            if (updateObject.data.personEmail && updateObject.data.personEmail.endsWith("@sparkbot.io"))
            {
                console.log("Message from bot. Skipping.");
                return;
            }

            this.loadMessage(updateObject.data.id)
                .then((msg)=> {
                    let messageText = msg.text;
                    let chatId = msg.roomId;

                    if (messageText && chatId) {
                        console.log(chatId, messageText);

                        // to remove bot name from message
                        if (this._botName) {
                            messageText = messageText.replace(this._botName, '');
                        }

                        if (this._shortName) {
                            messageText = messageText.replace(this._shortName, '');
                        }

                        if (!this._sessionIds.has(chatId)) {
                            this._sessionIds.set(chatId, uuid.v4());
                        }

                        let apiaiRequest = this._apiaiService.textRequest(messageText,
                            {
                                sessionId: this._sessionIds.get(chatId),
                                originalRequest: {
                                    data: updateObject,
                                    source: "spark"
                                }
                            });

                        apiaiRequest.on('response', (response) => {
                            if (this.isDefined(response.result)) {
                                let responseText = response.result.fulfillment.speech;
                                let responseMessages = response.result.fulfillment.messages;

                                if (this.isDefined(responseMessages) && responseMessages.length > 0) {
                                    this.replyWithRichContent(chatId, responseMessages)
                                        .then(() => {
                                            console.log('Reply sent');
                                        })
                                        .catch((err) => {
                                            console.error(err);
                                        });
                                    this.createResponse(res, 200, 'Reply sent');

                                } else if (this.isDefined(responseText)) {
                                    console.log('Response as text message');
                                    this.reply(chatId, responseText)
                                        .then((answer) => {
                                            console.log('Reply answer:', answer);
                                        })
                                        .catch((err) => {
                                            console.error(err);
                                        });
                                    this.createResponse(res, 200, 'Reply sent');

                                } else {
                                    console.log('Received empty speech');
                                    this.createResponse(res, 200, 'Received empty speech');
                                }
                            } else {
                                console.log('Received empty result');
                                this.createResponse(res, 200, 'Received empty result');
                            }
                        });

                        apiaiRequest.on('error', (error) => {
                            console.error('Error while call to api.ai', error);
                            this.createResponse(res, 200, 'Error while call to api.ai');
                        });
                        apiaiRequest.end();
                    }
                })
                .catch((err) => {
                    console.error("Error while loading message:", err)
                });
        }

    }

    reply(roomId, text, markdown) {

        let msg = {
            roomId: roomId
        };

        if (text) {
            msg.text = text;
        }

        if (markdown) {
            msg.markdown = markdown;
        }

        return new Promise((resolve, reject) => {
            request.post("https://api.ciscospark.com/v1/messages",
                {
                    auth: {
                        bearer: this._botConfig.sparkToken
                    },
                    forever: true,
                    json: msg
                }, (err, resp, body) => {
                    if (err) {
                        console.error('Error while reply:', err);
                        reject('Error while reply: ' + err.message);
                    } else if (resp.statusCode != 200) {
                        console.log('Error while reply:', resp.statusCode, body);
                        reject('Error while reply: ' + body);
                    } else {
                        console.log("reply answer body", body);
                        resolve(body);
                    }
                });
        });
    }

    replyWithRichContent(roomId, messages){
        let sparkMessages = [];

        for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
            let message = messages[messageIndex];

            switch (message.type) {
                case 0:
                    // speech: ["hi"]
                    // we have to get value from fulfillment.speech, because of here is raw speech
                    if (message.speech) {
                        sparkMessages.push({text: message.speech});
                    }

                    break;

                case 1: {

                    let msg = {};

                    let textMessage = "";
                    let markdownMessage = "";

                    if (message.title) {
                        textMessage += message.title;
                        markdownMessage += `**${message.title}**`;
                    }

                    if (message.subtitle) {
                        textMessage += "\n";
                        textMessage += message.subtitle;

                        markdownMessage += "<br>";
                        markdownMessage += message.subtitle;
                    }

                    if (message.imageUrl) {
                        msg.files = [ message.imageUrl ];
                    }

                    if (message.buttons.length > 0) {

                        for (let buttonIndex = 0; buttonIndex < message.buttons.length; buttonIndex++) {
                            let button = message.buttons[buttonIndex];
                            let text = button.text;
                            let postback = button.postback;

                            if (text) {

                                if (!postback) {
                                    postback = text;
                                }

                                if (postback.startsWith('http')) {
                                    textMessage += "\n" + text;
                                    markdownMessage += "\n" + ` - [${text}](${postback})`;
                                } else {
                                    textMessage += "\n" + ` - ${text}`;
                                    markdownMessage += "\n" + ` - ${text}`;
                                }
                            }
                        }
                    }

                    msg.text = textMessage;
                    msg.markdown = markdownMessage;

                    sparkMessages.push(msg);
                }

                    break;

                case 2: {
                    if (message.replies && message.replies.length > 0) {
                        let msg = {};

                        msg.text = message.title ? message.title : 'Choose an item';
                        msg.markdown = message.title ? "**" + message.title + "**" : '**Choose an item:**';

                        message.replies.forEach((r) => {
                            msg.text += "\n - " + r;
                            msg.markdown += "\n - " + r;
                        });

                        sparkMessages.push(msg);
                    }
                }

                    break;

                case 3:

                    if (message.imageUrl) {
                        let msg = {};

                        // "imageUrl": "http://example.com/image.jpg"
                        msg.files = [ message.imageUrl ];
                        sparkMessages.push(msg);
                    }

                    break;

                case 4:
                    if (message.payload && message.payload.spark) {
                        sparkMessages.push(message.payload.spark);
                    }
                    break;

                default:
                    break;
            }
        }

        return new Promise((resolve, reject) => {
            async.eachSeries(sparkMessages, (msg, callback) => {
                    this.replyWithData(roomId, msg)
                        .then(() => setTimeout(()=>callback(), 300))
                        .catch(callback);
                },
                (err)=> {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
        });
    }

    replyWithData(roomId, messageData) {

        let msg = messageData;
        msg.roomId = roomId;

        return new Promise((resolve, reject) => {
            request.post("https://api.ciscospark.com/v1/messages",
                {
                    auth: {
                        bearer: this._botConfig.sparkToken
                    },
                    forever: true,
                    json: msg
                }, (err, resp, body) => {
                    if (err) {
                        console.error('Error while reply:', err);
                        reject('Error while reply: ' + err.message);
                    } else if (resp.statusCode != 200) {
                        console.log('Error while reply:', resp.statusCode, body);
                        reject('Error while reply: ' + body);
                    } else {
                        console.log("reply answer body", body);
                        resolve(body);
                    }
                });
        });
    }

    loadMessage(messageId) {
        return new Promise((resolve, reject) => {
            request.get("https://api.ciscospark.com/v1/messages/" + messageId,
                {
                    auth: {
                        bearer: this._botConfig.sparkToken
                    }
                }, (err, resp, body) => {
                    if (err) {
                        console.error('Error while reply:', err);
                        reject(err);
                    } else if (resp.statusCode != 200) {
                        console.log('LoadMessage error:', resp.statusCode, body);
                        reject('LoadMessage error: ' + body);
                    } else {
                        console.log("message body", body);
                        let result = JSON.parse(body);
                        resolve(result);
                    }
                });
        });
    }

    createResponse(resp, code, message) {
        return resp.status(code).json({
            status: {
                code: code,
                message: message
            }
        });
    }

    isDefined(obj) {
        if (typeof obj == 'undefined') {
            return false;
        }

        if (!obj) {
            return false;
        }

        return obj != null;
    }
};
