var now = require("performance-now");
var Web3 = require('web3');
const EthereumTx = require('ethereumjs-tx');
var EC = require('elliptic').ec;
var ec = new EC('secp256k1');
var CryptoJS = require('crypto-js');


const config = require('./gas_price_test.config.json');

const signerKey = config["COINBASE_PRIVATE_KEY"];
const receiverAddress = config["TEST_RECEIVER"]; //song toss wheel clock divert endorse basic couch aim bracket unveil foam
const numberOfTokens = 11;
const CONST_MIN_GAS_LIMIT = 90000;
const CONST_ETH_NODE_URL = config["ETH_NODE"];

var CONST_TOKEN_ABI = config["TSP_TOKEN_ABI"];
var CONST_TOKEN_ADDRESS = config["TSP_CONTRACT_TOKEN"];

const web3 = new Web3(new Web3.providers.HttpProvider(CONST_ETH_NODE_URL));
tsp_token = web3.eth.contract(CONST_TOKEN_ABI).at(CONST_TOKEN_ADDRESS);

var fixedGasPrice1 = function (estimatedAmount) { return 21000000000; }; //21GWEI
var fixedGasPrice2 = function (estimatedAmount) { return 31500000000; }; //31.5GWEI
var fixedGasPrice3 = function (estimatedAmount) { return 42000000000; }; //42GWEI
var fixedGasPrice4 = function (estimatedAmount) { return 15750000000; }; //15.75GWEI
var fixedGasPrice5 = function (estimatedAmount) { return 10500000000; }; //10.5GWEI

var dynamicGasPrice1 = function (estimatedAmount) { return estimatedAmount; };
var dynamicGasPrice2 = function (estimatedAmount) { return estimatedAmount*1.5; };
var dynamicGasPrice3 = function (estimatedAmount) { return estimatedAmount*2; };
var dynamicGasPrice4 = function (estimatedAmount) { return estimatedAmount*0.75; };
var dynamicGasPrice5 = function (estimatedAmount) { return estimatedAmount*0.5; };

var tests = [{
    label: "fixed gas price 1 (21GEWI)",
    pricer: fixedGasPrice1
},{
    label: "fixed gas price 2 (31.5GEWI)",
    pricer: fixedGasPrice2
},{
    label: "fixed gas price 3 (42GEWI)",
    pricer: fixedGasPrice3
},{
    label: "fixed gas price 4 (15.75GEWI)",
    pricer: fixedGasPrice4
},{
    label: "fixed gas price 5 (10.5GEWI)",
    pricer: fixedGasPrice5
},{
    label: "dynamic gas price 1 (est)",
    pricer: dynamicGasPrice1
},{
    label: "dynamic gas price 2 (est*1.5)",
    pricer: dynamicGasPrice2
},{
    label: "dynamic gas price 3 (est*2)",
    pricer: dynamicGasPrice3
},{
    label: "dynamic gas price 4 (est*0.75)",
    pricer: dynamicGasPrice4
},{
    label: "dynamic gas price 5 (est*0.5)",
    pricer: dynamicGasPrice5
}];

var testTime = 5*60*1000;


function _computeAddressFromPrivKey(privKey) {
    var keyPair = ec.genKeyPair();
    keyPair._importPrivate(privKey, 'hex');
    var compact = false;
    var pubKey = keyPair.getPublic(compact, 'hex').slice(2);
    var pubKeyWordArray = CryptoJS.enc.Hex.parse(pubKey);
    var hash = CryptoJS.SHA3(pubKeyWordArray, { outputLength: 256 });
    var address = hash.toString(CryptoJS.enc.Hex).slice(24);

    return address;
};

function toHex(num) {
    var hex = new Number(num).toString(16);
    if (hex.length % 2 == 1) {
        hex = '0' + hex;
    }
    hex = '0x' + hex;
    return hex;
}

function _callOnTxComplete(txHash, cb, delay, maxwait) {
    if (!delay) delay = 4000;

    if (!maxwait) maxwait = 5*60*1000;

    var day = new Date();
    var timestamp = date.getTime();

    var tx = web3.eth.getTransaction(txHash);
    if (!tx) {
        cb(false);
    } else if (tx.blockNumber) {
        cb(true);
    } else {
        var txChecker = setInterval(function () {
            var nwDay = new Date();
            var nwTimestamp = date.getTime();

            var diff = nwTimestamp -timestamp;
            if (diff>maxwait) {
                console.log('maxwait reached');
                clearInterval(txChecker);
                cb(false);
                return;
            }
            var tx = web3.eth.getTransaction(txHash);
            if (!tx) {
                clearInterval(txChecker);
                cb(false);
            } else if (tx.blockNumber) {
                clearInterval(txChecker);
                cb(true);
            }
        }, delay);
        return txChecker;
    }
}

function testOnce(label, pricer,cb) {
    var startTime = now();
    console.log(label);
    console.log('start time:'+startTime.toFixed(3))
    web3.eth.getGasPrice((e, price) => {
        if (!e) {
            console.log("estimated gas price:"+price);
            var myprice = pricer(price);
            console.log("calculated gas price:"+myprice);

            var address = '0x' + _computeAddressFromPrivKey(signerKey);
            var gas = tsp_token.transfer.estimateGas(receiverAddress, numberOfTokens);
            console.log("estimated gas limit:"+gas);
            var data = tsp_token.transfer.getData(receiverAddress, numberOfTokens);
            gas = gas * 1.5;
            if (gas < CONST_MIN_GAS_LIMIT) {
                gas = CONST_MIN_GAS_LIMIT;
            }
            console.log("calculated gas limit:"+gas);
            var nonce = web3.eth.getTransactionCount(address, 'pending');
            var latestNonce = web3.eth.getTransactionCount(address, 'latest');
            if (latestNonce>nonce) {
                nonce = latestNonce;
            }
            const txParams = {
                nonce: toHex(nonce),
                gasPrice: toHex(parseInt(price.toString())),
                gasLimit: toHex(gas),
                to: CONST_TOKEN_ADDRESS,
                value: toHex(0),
                data: data
            }

            const tx = new EthereumTx(txParams)
            const privateKey = Buffer.from(signerKey, 'hex');
            tx.sign(privateKey);
            var signedRawTx = "0x" + tx.serialize().toString('hex')
            web3.eth.sendRawTransaction(signedRawTx, function (e, hash) {
                if (e) {
                    console.log('tx (@point1) failed:'+label);
                    console.log(e);
                    cb(false,null,label);
                } else {
                    console.log(hash);
                    _callOnTxComplete(hash,function(res) {
                        if (!res) {
                            console.log('tx (@point2) failed:'+label);
                            cb(false,null,label);
                        } else {
                            var end = now();
                            console.log('end time:'+end.toFixed(3));
                            var diff = end-startTime;
                            console.log('diff time:'+diff.toFixed(3))
                            cb(res,diff,label);
                        }
                    });
                }
            });
        } else {
            console.log('tx (@point3) failed:'+label);
            console.log(e);
            cb(false,null,label);
        }
    });
}

function testAll(cbDone) {
    var latestTime = null;
    var latestLabel = null;
    
	var lastFn = function(res,diff,label) {
        if(res && (!latestTime || (latestTime && latestTime>diff))) {
            latestTime = diff;
            latestLabel = label;
        }
        if (latestTime) {
            console.log('latest time: '+latestTime.toFixed(3));
            console.log('latest label: '+latestLabel);
        }
        if (cbDone)
            cbDone();
    };
    for (var j = tests.length - 1; j >= 0; j--) {
        var test = tests[j];
        function getFn() {
			var o = {
				label: test.label,
				pricer: test.pricer,
				lastFn: lastFn
			};
			return function (mRes,mDiff,mLabel) {
                if (mRes && (!latestTime || (latestTime && latestTime>mDiff))) {
                    latestTime = mDiff;
                    latestLabel = mLabel;
                }
				testOnce(o.label,o.pricer,o.lastFn);
			};
		}
		lastFn = getFn();
    }
    lastFn();
}

testAll();