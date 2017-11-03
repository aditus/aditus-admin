var Web3 = require('web3');
const EthereumTx = require('ethereumjs-tx');
var EC = require('elliptic').ec;
var ec = new EC('secp256k1');
var CryptoJS = require('crypto-js');

function gethash(message) {
    return CryptoJS.SHA3(message, { outputLength: 256 }).toString(CryptoJS.enc.Hex);
}

function utils(config) {
    const CONST_MIN_GAS_PRICE = 21000000000; //21GWEI
    const CONST_MIN_GAS_LIMIT = 90000;
    const MAX_TRY_TIME = 60000; //a minute
    const CONST_ETH_NODE_URL = config["ETH_NODE"];

    var CONST_TOKEN_ABI = config["TSP_TOKEN_ABI"];
    var CONST_TOKEN_ADDRESS = config["TSP_CONTRACT_TOKEN"];

    var CONST_TRANSFER_METHOD_SIGNATURE = "transfer(address,uint256)";

    const web3 = new Web3(new Web3.providers.HttpProvider(CONST_ETH_NODE_URL));
    tsp_token = web3.eth.contract(CONST_TOKEN_ABI).at(CONST_TOKEN_ADDRESS);

    function _transferEth(walletAddress, amountInEth, signerKey, cb) {
        var amountInWei = _fromEth(amountInEth);
        _transferWei(walletAddress, amountInWei, signerKey, cb);
    }

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

    function _transferWei(walletAddress, amountInWei, signerKey, cb) {
        const privateKey = Buffer.from(signerKey, 'hex');
        _estimateGasPrice((price) => {
            var address = '0x' + _computeAddressFromPrivKey(signerKey);
            var gas = web3.eth.estimateGas({});
            gas = gas * 1.5;
            if (gas < CONST_MIN_GAS_LIMIT) {
                gas = CONST_MIN_GAS_LIMIT;
            }
            var nonce = web3.eth.getTransactionCount(address);
            txParams = {
                nonce: toHex(nonce),
                gasPrice: toHex(parseInt(price.toString())),
                gasLimit: toHex(gas),
                to: walletAddress,
                value: toHex(amountInWei)
            };

            const tx = new EthereumTx(txParams)
            tx.sign(privateKey);
            var signedRawTx = "0x" + tx.serialize().toString('hex')
            web3.eth.sendRawTransaction(signedRawTx, function (e, hash) {
                if (e) {
                    console.log(e);
                    console.log(JSON.stringify(txParams));
                }
                cb(e, hash);
            });
        });
    }

    function _transferTsp(receiverAddress, numberOfTokens, signerKey, cb, lastNonce, firstTryAt) {
        const privateKey = Buffer.from(signerKey, 'hex');
        _estimateGasPrice((price) => {
            var address = '0x' + _computeAddressFromPrivKey(signerKey);
            var gas = tsp_token.transfer.estimateGas(receiverAddress, numberOfTokens);
            var data = tsp_token.transfer.getData(receiverAddress, numberOfTokens);
            gas = gas * 1.5;
            if (gas < CONST_MIN_GAS_LIMIT) {
                gas = CONST_MIN_GAS_LIMIT;
            }
            var nonce = web3.eth.getTransactionCount(address, 'pending');
            var latestNonce = web3.eth.getTransactionCount(address, 'latest');
            if (latestNonce > nonce) {
                console.log('latest nounce: ' + latestNonce + ', pending nounce: ' + nonce);
                nonce = latestNonce;
            }
            if (lastNonce && nonce <= lastNonce) {
                nonce = lastNonce+1;
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
            tx.sign(privateKey);
            var signedRawTx = "0x" + tx.serialize().toString('hex')
            web3.eth.sendRawTransaction(signedRawTx, function (e, hash) {
                var tryagain = false;
                if (e) {
                    var strErr = e.toString();
                    if (strErr.includes("known transaction") || strErr.includes('replacement transaction underpriced')) {
                        tryagain = true;
                        var date = new Date();
                        var timestamp = date.getTime();
                        if (!firstTryAt) {
                            firstTryAt = timestamp;
                        } else {
                            var diff = timestamp - firstTryAt;
                            if (diff > MAX_TRY_TIME) {
                                console.log('diff: ' + diff);
                                tryagain = false;
                            }
                        }
                        if (tryagain) {
                            console.log('retrying again, last nounce:' + nonce);
                            _transferTsp(receiverAddress, numberOfTokens, signerKey, cb, nonce, firstTryAt);
                        }
                    }
                    if (!tryagain) {
                        console.log(e);
                        console.log(JSON.stringify(txParams));
                    }
                }
                if (!tryagain)
                    cb(e, hash);
            });
        });
    }

    function _estimateGasPrice(cb) {
        web3.eth.getGasPrice((e, price) => {
            if (!e) {
                if (CONST_MIN_GAS_PRICE > price) {
                    var inn = price * 1.05;
                    if (CONST_MIN_GAS_PRICE < inn) {
                        return cb(CONST_MIN_GAS_PRICE)
                    } else
                        return cb(inn);
                } else
                    cb(price);
            } else {
                cb(CONST_MIN_GAS_PRICE);
            }
        });
    }

    function _toEth(weiAmount) {
        return web3.fromWei(weiAmount, 'ether');
    }

    function _fromEth(amount) {
        return web3.toWei(amount, 'ether');
    }

    function _formatTx(tx) {
        var result = {
            hash: tx.hash,
            sender: tx.from
        }
        var input = tx.input;
        if (input.length == (10 + 64 + 64) && (input.substr(0, 10) == ('0x' + gethash(CONST_TRANSFER_METHOD_SIGNATURE)).substr(0, 10))) {
            result.contract = tx.to;
            result.receiver = "0x" + input.substr(10, 64).replace(/^0+/, '');
            result.amount = parseInt("0x" + input.substr(10 + 64, 64)); //web3.toDecimal("0x"+ input.substr(10+64,64));
        } else {
            result.contract = null;
            result.receiver = tx.to;
            result.amount = tx.value / 1000000000000000000; //web3.fromWei(result.value, 'ether');
        }
        result.tx = tx;
        return result;
    }

    function _callOnTxComplete(txHash, cb, delay) {
        if (!delay) delay = 4000;

        var tx = web3.eth.getTransaction(txHash);
        if (!tx) {
            cb(false);
        } else if (tx.blockNumber) {
            cb(true);
        } else {
            var txChecker = setInterval(function () {
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

    function _getTransaction(txHash) {
        var tx = web3.eth.getTransaction(txHash);
        if (tx) {
            tx.formatted = _formatTx(tx);
        }
    }

    function _getWeiBalance(walletAddress) {
        return web3.eth.getBalance(walletAddress);
    }

    function _getEthBalance(walletAddress) {
        var weiBalance = web3.eth.getBalance(walletAddress);
        return _toEth(weiBalance);
    }

    function _getTspBalance(walletAddress) {
        return tsp_token.balanceOf(walletAddress);
    }

    return {
        toEth: _toEth,
        fromEth: _fromEth,
        estimateGasPrice: _estimateGasPrice,
        transferEth: _transferEth,
        transferWei: _transferWei,
        transferTsp: _transferTsp,
        formatTx: _formatTx,
        callOnTxComplete: _callOnTxComplete,
        getTransaction: _getTransaction,
        getWeiBalance: _getWeiBalance,
        getEthBalance: _getEthBalance,
        getTspBalance: _getTspBalance
    }
}

module.exports = utils;