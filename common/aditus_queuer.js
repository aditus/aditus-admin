var sqs = require('sqs');
var messenger = require('messenger');

function queuer(config, identifier) {
    const queueName = identifier;
    var mockClient = null;
    var queue = null;
    if (config["MessageQueue"]["MOCK"]) {
        mockClient = messenger.createSpeaker(config["MessageQueue"]["MOCK_PORT"]);
    } else {
        var opitons = config["MessageQueue"]["AWS_CONFIG"];
        queue = sqs(opitons);
    }

    function _register(cb) {
        if (mockClient) {
            mockClient.request('register', { queueName: queueName }, cb);
        }
    }
    
    function _push(message) {
        if (mockClient) {
            mockClient.request('message', {
                    queueName: queueName,
                    message: message
                }, function (data) {
                    console.log(data);
            });
            return true;
        } else {
            try {
            console.log('pushing to aws sqs:' + message +'>'+queueName );
                queue.push(queueName, message, function () {
                    console.log('sent to aws sqs');
                });
            } catch(e) {
                console.log('err:'+e);
            }
        }
    }
    
    function _pull(callback) {
        if (mockClient) {
            var fnCall = function() {
                mockClient.request('pull', {
                        queueName: queueName
                    }, function (data) {
                        if(data.has) {
                            callback(data.message,fnCall);
                        }
                });
            }
            fnCall();
            return true;
        } else {
            try {
                queue.pull(queueName, callback);
            } catch(e) {
                console.log('err:'+e);
            }
        }
    }

    function _onReceive(cb,delay) {
        if (!delay) delay = 4000;
        setInterval(function() {
            _pull(function(message, callback) {
                cb(message);
                callback();
            })
        },delay)
    } 

    return {
        push: _push,
        pull: _pull,
        register: _register,
        onReceive: _onReceive
    }
}

module.exports = queuer;