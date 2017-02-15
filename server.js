var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var apiai = require('apiai');
var apiaiApp = apiai('4dc8d03e753c4a6db3907dd67380dcfe');
//Specify a port
var port = process.env.port || 8080;

//Serve up files in public folder
app.use('/', express.static(__dirname + '/public'));

//Start up the website
app.listen(port);
console.log('Listening on port: ', port);


app.get('/webhook', (req, res) => {
    console.log("GET method");
    console.log(req.body);

});

/* Handling all messenges */
app.post('/webhook', (req, res) => {
    console.log("message posted");
    //console.log(req.body.entry.event.message.text);
    //console.log(req.body);
    let updateObject = req.body;
    //console.log(req.body.id);

    var msgId = updateObject.data.id;
    var senderId = updateObject.data.personId;
    //console.log(msgId);
    loadMessage(msgId)
        .then((msg) => {
            let messageText = msg.text;
            let chatId = msg.roomId;
            //console.log(messageText);
            //console.log(chatId);
            sendMessage(senderId, messageText);
    })
    .catch((err) => {
        console.error("Error while loading message:", err)
     });

});

app.post('/ai', (req, res) => {
    console.log('*** Webhook for api.ai query ***');
    //console.log(req.body.result);

    if (req.body.result.action === 'weather') {
        console.log('*** weather ***');
        let city = req.body.result.parameters['geo-city'];
        let restUrl = 'http://api.openweathermap.org/data/2.5/weather?APPID=' + 'f0cdb9e1184eaca0aeb54c211cbc56f3' + '&q=' + city;

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

function sendMessage(sender, msgText, sRoomId) {
    //let sender = event.sender.id;
    //let text = event.message.text;


    let apiai = apiaiApp.textRequest(msgText, {
        sessionId: 'tabby_cat' // use any arbitrary id
    });

    apiai.on('response', (response) => {
        // Got a response from api.ai. Let's POST spark
        let aiText = response.result.fulfillment.speech;

        var msg = {
            roomId: sRoomId,
            toPersonId: sender,
            text: aiText
        }

        request.post('https://api.ciscospark.com/v1/messages',
            {
                auth: {
                    bearer: 'YzQ1NDdiMjQtY2RjMS00NDE0LThlZDUtNzUxN2E3MGNlNTQwYjM5NTRmNTYtODRk'
                },
                json: msg
            }, function (error, response) {
                if (error) {
                    console.log('Error sending message: ', error);
                }
            });


    });

    apiai.on('error', (error) => {
        console.log(error);
    });

    apiai.end();

}

function loadMessage(messageId) {
    return new Promise((resolve, reject) => {
        request.get("https://api.ciscospark.com/v1/messages/" + messageId,
            {
                auth: {
                    bearer: 'YzQ1NDdiMjQtY2RjMS00NDE0LThlZDUtNzUxN2E3MGNlNTQwYjM5NTRmNTYtODRk'
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
