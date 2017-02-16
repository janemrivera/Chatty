'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

const SparkBot = require('./sparkbot');
const SparkBotConfig = require('./sparkbotconfig');

const REST_PORT = (process.env.PORT || 8080);
const DEV_CONFIG = process.env.DEVELOPMENT_CONFIG == 'true';

const APP_NAME = 'chattyexpressapp'; //process.env.APP_NAME;
const APIAI_ACCESS_TOKEN = '4dc8d03e753c4a6db3907dd67380dcfe' ; //process.env.APIAI_ACCESS_TOKEN;
const APIAI_LANG = 'en'; //process.env.APIAI_LANG;

const SPARK_ACCESS_TOKEN = 'YzQ1NDdiMjQtY2RjMS00NDE0LThlZDUtNzUxN2E3MGNlNTQwYjM5NTRmNTYtODRk'; // process.env.SPARK_ACCESS_TOKEN;
const OPENWEATHERMAP_APIID = 'f0cdb9e1184eaca0aeb54c211cbc56f3';

var baseUrl = "";
if (APP_NAME) {
    // Heroku case
    baseUrl = `https://${APP_NAME}.azurewebsites.net`;
} else {
    console.error('Set up the url of your service here and remove exit code!');
    process.exit(1);
}

var bot;

// console timestamps
require('console-stamp')(console, 'yyyy.mm.dd HH:MM:ss.l');

function startBot() {

    console.log("Starting bot");

    const botConfig = new SparkBotConfig(
        APIAI_ACCESS_TOKEN,
        APIAI_LANG,
        SPARK_ACCESS_TOKEN);

    botConfig.devConfig = DEV_CONFIG;

    bot = new SparkBot(botConfig, baseUrl + '/webhook');
    bot.setupWebhook();
}

startBot();

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
    console.log('POST webhook');

    try {
        if (bot) {
            console.log('Processing message...');
            bot.processMessage(req, res);
        }
    } catch (err) {
        return res.status(400).send('Error while processing ' + err.message);
    }
});

app.post('/ai', (req, res) => {
    console.log('*** Webhook for api.ai query ***');
    //console.log(req.body.result);

    if (req.body.result.action === 'weather') {
        console.log('*** weather ***');
        let city = req.body.result.parameters['geo-city'];
        let restUrl = 'http://api.openweathermap.org/data/2.5/weather?APPID=' + OPENWEATHERMAP_APIID + '&q=' + city;

        request.get(restUrl, (err, response, body) => {
            if (!err && response.statusCode == 200) {
                let json = JSON.parse(body);
                console.log(json);
                let tempF = ~~(json.main.temp * 9 / 5 - 459.67);
                let tempC = ~~(json.main.temp - 273.15);
                let msg = 'The current condition in ' + json.name + ' is ' + json.weather[0].description + ' and the temperature is ' + tempF + ' ℉ (' + tempC + ' ℃).'
                return res.json({
                    speech: msg,
                    displayText: msg,
                    source: 'weather'
                });
                console.log('**weather response retrieved**');
            } else {
                let errorMessage = 'I failed to look up the city name.';
                return res.status(400).json({
                    status: {
                        code: 400,
                        errorType: errorMessage
                    }
                });
            }
        })
    }

});

app.listen(REST_PORT, () => {
    console.log('Rest service ready on port ' + REST_PORT);
});
