'use strict';
console.log('Loading function');
var aws = require('aws-sdk');

const redirectToEmail = "kaveh.azad@beyondaroom.com";
const settings = [{
    subjectContains: ["RE: Reservation", "Cancelled", "wants to change their reservation", "Pending: Reservation Request", "Alternative amount requested:", "Reservation Confirmed"],
    redirectTo: "mybooking@beyondaroom.com"
}, {
    subjectContains: ["booking enquiry", "RE: Pre-approval", "RE: Enquiry", "Enquiry at"],
    redirectTo: "enquiry@beyondaroom.com"
}];
const senderEmailContains = "airbnb.com"

exports.handler = (event, context, callback) => {
    var MailParser = require("mailparser").MailParser;
    var mailparser = new MailParser();
    //console.log('Received event:', JSON.stringify(event, null, 2));
    //var message = JSON.parse(event.Records[0].Sns.Message);
    console.log(JSON.stringify(event));
    var message = JSON.parse(event.Records[0].Sns.Message);
    console.log(message);
    var mailContent = message.content;
    //console.log(mailContent);

    // setup an event listener when the parsing finishes
    mailparser.on("end", function(mail_object) {
        console.log("From:", mail_object.from); //[{address:'sender@example.com',name:'Sender Name'}]
        //console.log("Subject:", mail_object.subject); // Hello world!
        //console.log("Text body:", mail_object.text); // How are you today?
        var headers = message.mail.commonHeaders;
        var from = headers.from[0];
        var replyTo = from;
        if (headers.replyTo != null && headers.replyTo.length > 0)
            replyTo = headers.replyTo[0];

        var originalReceiver = headers.to[0];

        determinePath(from, replyTo, originalReceiver, mail_object);
    });

    // send the email source to the parser
    mailparser.write(mailContent);
    mailparser.end();
};

function determinePath(from, replyTo, originalReceiver, parsedMail) {

    if (originalReceiver.indexOf('_redirect@beyondaroom.net') > -1) {
        console.log('got response to redirected mail');
        getMapping(originalReceiver, (err, data) => {
            if (err)
                console.log(err);
            else {
                if (data && data.Item) {
                    console.log('loaded existing mapping -> ' + JSON.stringify(data.Item));
                    var mapping = data.Item.mapping;
                    sendMail(parsedMail, data.Item.replyFrom, [mapping]);
                } else {
                    console.log('Could not find mappings for reply');
                }
            }
        })
    } else {
        console.log('received mail from airbnb. redirecting mail');

        getMapping(replyTo, (err, data) => {
            if (err)
                console.log(err);
            else {
                var to = [redirectToEmail];
                var mapping = null;
                if (data && data.Item) {
                    console.log('loaded existing mapping -> ' + JSON.stringify(data.Item));
                    mapping = data.Item.mapping;
                    sendMail(parsedMail, mapping, to);
                } else {
                    var rand = randomIntFromInterval(100000000000, 999999999999);
                    mapping = rand + "_redirect@beyondaroom.net";
                    saveMappings(replyTo, mapping, originalReceiver, (err, data) => {
                        if (err)
                            console.log(err);
                        else {
                            console.log('mapping saved successful');
                            sendMail(parsedMail, mapping, to);
                        }
                    });
                }
            }
        });
    }
}

function saveMappings(receiver, mapped, originalReceiver, callback) {
    var params = {
        RequestItems: {
            'email_redirect_mappings': [{
                PutRequest: {
                    Item: {
                        email: receiver,
                        mapping: mapped,
                        replyFrom: originalReceiver
                    }
                }
            }, {
                PutRequest: {
                    Item: {
                        email: mapped,
                        mapping: receiver,
                        replyFrom: originalReceiver
                    }
                }
            }]
        }
    }

    var docClient = new aws.DynamoDB.DocumentClient();

    docClient.batchWrite(params, function(err, data) {
        callback(err, data);
    });
}

function getMapping(email, callback) {
    var params = {
        TableName: 'email_redirect_mappings',
        Key: {
            email: email
        }
    };

    var docClient = new aws.DynamoDB.DocumentClient();

    docClient.get(params, function(err, data) {
        callback(err, data);
    });
}

function sendMail(parsedMail, from, to) {
    var ses = new aws.SES({
        apiVersion: '2010-12-01'
    });


    var options = {
        Source: from,
        Destination: {
            ToAddresses: to
        },
        Message: {
            Subject: {
                Data: parsedMail.subject
            },
            Body: {
                Text: {
                    Data: parsedMail.text
                },
                Html: {
                    Data: parsedMail.html || parsedMail.text
                }
            }
        }
    };
    console.log(options);
    ses.sendEmail(options, function(err, data) {
        if (err)
            console.log(err);
        console.log('sending email ended');
    });
}

function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
