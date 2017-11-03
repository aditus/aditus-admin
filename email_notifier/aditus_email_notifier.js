
const sgMail = require('@sendgrid/mail');
const aditus_queuer = require('../common/aditus_queuer.js');
var config = require('../aditus_config.json');

function email_notifier(config) {
    sgMail.setApiKey(config.EmailNotifier["SENDGRID_API_KEY"]);
    
    function _notify(title,message) {
        var fromEmail = config.EmailNotifier["FROM_EMAIL"];
        var toEmailAddresses = config.EmailNotifier["EMAIL_ADDRESSES"];
        if (toEmailAddresses && toEmailAddresses.length>0) {
            for (var i=0; i<toEmailAddresses.length;i++) {
                var toAddress= toEmailAddresses[i];
                const msg = {
                    to: toAddress,
                    from: fromEmail,
                    subject: title,
                    text: message
                };
                sgMail.send(msg);
            }
        }
        return true;
    }

    function _startQueue() {
        var queueName = config.EmailNotifier["QUEUE_NAME"];
        const queue = aditus_queuer(config,queueName);
        queue.register();
        queue.onReceive(function(email) {
            _notify(email.title,email.message);
        })
        console.log(queueName + ' LISTENING');
    }
    return {
        notify: _notify,
        startQueue: _startQueue
    }
}

var instance = email_notifier(config);
instance.startQueue();