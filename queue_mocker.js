
var messenger = require('messenger');
var server1 = messenger.createListener(8020);

var messagesQueues = {};

server1.on('message', function(m, data){
    if (messagesQueues[data.queueName]) {
        var queue = messagesQueues[data.queueName];
        queue.messages.push(data.message);
        console.log('pushed '+data.message+'>'+data.queueName);
        return m.reply('pushed');
    }
    m.reply('no queue found');
});

server1.on('register', function(m, data) {
    if (messagesQueues[data.queueName]) {
        console.log('already registered '+data.queueName);
        return m.reply({result:false});
    } else {
        messagesQueues[data.queueName] = {
            messages: [],
            nextRead: 0
        }
        console.log('newly registered '+data.queueName);
        return m.reply({result:true});
    }
});

server1.on('pull',function(m, data) {
    if (messagesQueues[data.queueName]) {
        var queue = messagesQueues[data.queueName];
        if (queue.messages.length<=queue.nextRead) {
            m.reply({
                has: false
            });
        } else {
            var message =queue.messages[queue.nextRead];
            m.reply({
                has: true,
                message: message
            });
            queue.nextRead++;
            console.log('pulled '+ message+'<'+data.queueName);
        }
    }
    m.reply({
        has: false
    });
});

console.log('mocking sqs queue...');