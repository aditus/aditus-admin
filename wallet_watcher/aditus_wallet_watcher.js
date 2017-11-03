const aditus_queuer = require('../common/aditus_queuer.js');
const aditus_utils = require('../common/aditus_utils.js');
var config = require('../aditus_config.json');

function wallet_watcher(config) {
    const utils = aditus_utils(config);

    const emailNotifier = aditus_queuer(config, config["EMAIL_QUEUE_NAME"]);

    const lastNotificationTimeForEth = { };
    const lastNotificationTimeForTsp = { };

    var walletArray = config.WalletWatcher["WALLET_ARRAY"];
    var minEthBalance = config.WalletWatcher["MIN_ETH_BALANCE"];
    var minTspBalance = config.WalletWatcher["MIN_TSP_BALANCE"];
    var waitTimeInSeconds = config.WalletWatcher["WAIT_TIME_IN_SECONDS"];
    var waitTimeInMs = waitTimeInSeconds*1000;
    var delayTimeInMs = config.WalletWatcher["DELAY_TIME_IN_MILLISECONDS"];

    var watcher;

    function _startWatching() {
        console.log('start watching wallet(s):' +walletArray.toString());

        function fnWatch() {
            for (var i=0; i<walletArray.length;i++) {
                var walletAddress = walletArray[i];
                var ethBalance = utils.getEthBalance(walletAddress);
                if (ethBalance<minEthBalance) {
                    var message = "wallet: "+walletAddress + ' has only '+ethBalance +'ETH in balance';
                    console.log(message);
                    var okToNotify = true;
                    var date = new Date();
                    var timestamp = date.getTime();
                    lastNotificationTime = lastNotificationTimeForEth[walletAddress];
                    if (lastNotificationTime) {
                        diff = timestamp - lastNotificationTime;
                        if (diff<waitTimeInMs) {
                            okToNotify = false;
                        }
                    }

                    if (okToNotify) {
                        emailNotifier.push({ title: "wallet watcher:"+walletAddress , message: message });
                        lastNotificationTimeForEth[timestamp]
                    }
                }
                var tspBalance = utils.getTspBalance(walletAddress);
                if (tspBalance<minTspBalance) {
                    var message = "wallet: "+walletAddress + ' has only '+tspBalance +'TSP in balance';
                    console.log(message);
                    var okToNotify = true;
                    var date = new Date();
                    var timestamp = date.getTime();
                    lastNotificationTime = lastNotificationTimeForTsp[walletAddress];
                    if (lastNotificationTime) {
                        diff = timestamp - lastNotificationTime;
                        if (diff<waitTimeInMs) {
                            okToNotify = false;
                        }
                    }

                    if (okToNotify) {
                        emailNotifier.push({ title: "wallet watcher:"+walletAddress , message: message });
                        lastNotificationTimeForTsp[timestamp]
                    }
                }
            }
        }

        watcher = setInterval(fnWatch,delayTimeInMs);
    }
    function _stopWatching() {
        if (watcher);
            clearInterval(watcher);
    }
    return {
        startWatching: _startWatching,
        stopWatching: _stopWatching
    }
}

var instance = wallet_watcher(config);
instance.startWatching();