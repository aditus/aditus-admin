
const aditus_pgconnect = require('./common/aditus_pgconnect.js');
const aditus_queuer = require('./common/aditus_queuer.js');
const aditus_utils = require('./common/aditus_utils.js');
var config = require('./aditus_token_reimburser_config.json');

function token_reimburser() {
    const CONST_TSP_CONTRACT_TOKEN = config["TSP_CONTRACT_TOKEN"];
    const CONST_CONNECTION_STR = config["CONNECTION_STRING"];
    const pgconnect = aditus_pgconnect(CONST_CONNECTION_STR);
    const utils = aditus_utils(config);

    const emailNotifier = aditus_queuer(config, config["EMAIL_QUEUE_NAME"]);

    function _reimburse(dealId) {
        function onFail(message) {
            emailNotifier.push({ title: 'token reimburser failed', message: message });
            console.log('FAILED: ' + message);
        }
        var sql = 'SELECT * FROM public.aditus_deal WHERE "id" = ' + " '" + dealId + "' LIMIT 1;";
        query_db(sql, function (results) {
            if (results && results.length > 0) {
                var deal = results[0];
                if ((deal.reimbursedTokens && deal.reimbursedTokens > 0) || (deal.reimbursedStatus && deal.reimbursedStatus.length > 0)) {
                    onFail('reimburse was already called for deal#' + dealId);
                    return;
                }
                //checking allocated tokens
                if (deal.allocatedTokens != deal.tokensPerRedemption * deal.totalRedemption) {
                    onFail('allocated tokens for deal#' + dealId + ' are invalid');
                    return;
                }
                if (deal.spentTokens > deal.allocatedTokens) {
                    onFail('spent tokens for deal#' + dealId + ' are invalid');
                    return;
                }
                if (deal.spentTokens == deal.allocatedTokens) {
                    onFail('all tokens for deal#' + dealId + ' has been spent');
                    return;
                }

                var sql = 'SELECT * FROM public.aditus_deal_claims WHERE "dealId" = ' + " '" + dealId + "';";
                query_db(sql, function (claims) {
                    var totalNumberOfTokens = 0;
                    var totalNumberOfTokensCalculatedFromEtheruem = 0;
                    if (claims && claims.length > 0) {
                        for (var i = 0; i < claims.length; i++) {
                            var claim = claims[i];
                            if (!claim.txHash) {
                                onFail('claims under deal#' + dealId + ' are pending');
                                return;
                            }
                            var tx = utils.getTransaction(claim.txHash);
                            if (!tx || !tx.blockNumber || tx.formatted.contract != CONST_TSP_CONTRACT_TOKEN) {
                                onFail('transactions under deal#' + dealId + ' are invalid');
                                return;
                            }
                            totalNumberOfTokensCalculatedFromEtheruem += tx.formatted.amount;
                        }
                    }
                    if (totalNumberOfTokens != totalNumberOfTokensCalculatedFromEtheruem || totalNumberOfTokens != deal.spentTokens) {
                        onFail('spent tokens for deal#' + dealId + " don't match with ethereum");
                        return;
                    }

                    reimbursedTokens = deal.allocatedTokens - totalNumberOfTokens;

                    var sql = 'SELECT * FROM public.aditus_partners WHERE "id" = ' + " '" + deal.partnerId + "' LIMIT 1;";
                    query_db(sql, function (res) {
                        if (res && res.length > 0) {
                            var partner = res[0];
                            if (!partner.walletAddress || partner.walletAddress.length < 1) {
                                onFail('partner wallet address for deal#' + dealId + ' is invalid');
                                return;
                            } else {
                                update_db(function (process, finish) {
                                    var sql = 'UPDATE public.aditus_deals SET "reimbursedTokens"=' + "'" + reimbursedTokens + "'" + ', "reimbursedStatus" = ' + "'INITIATED'" + ' WHERE "id"=' + "'" + dealId + "';";
                                    process(sql, function () {
                                        finish();
                                    });
                                }, function (res) {
                                    utils.transferTsp(partner.walletAddress, reimbursedTokens, config.TokenReimburser["COINBASE_PRIVATE_KEY"], function (e, hash) {
                                        if (!e) {
                                            update_db(function (process, finish) {
                                                var date = new Date();
                                                var timestamp = date.getTime();
                                                var sql = 'INSERT INTO public.aditus_reimburser_log("hash","timestamp","dealId","walletAddress","status") ' + " VALUES ('" + hash + "','" + timestamp + "','" + dealId + "','" + walletAddress + "','PENDING');";
                                                process(sql, function () {
                                                    finish();
                                                });
                                            }, function (result) {
                                                console.log('reimbursing... ' + reimbursedTokens + ' to wallet#' + partner.walletAddress + ' with tx#' + hash);
                                                utils.callOnTxComplete(hash, function (res) {
                                                    if (!res) {
                                                        update_db(function (process, finish) {
                                                            var statusUpdateSQL = 'UPDATE public.aditus_reimburser_log SET "status" = ' + "'FAILED'" + ' WHERE "hash"=' + "'" + hash + "';";
                                                            process(statusUpdateSQL, function () {
                                                                finish();
                                                            });
                                                        }, function (res) {
                                                            var message = 'unable to reimburse ' + reimbursedTokens + ' to wallet#' + partner.walletAddress + ' with tx#' + hash;
                                                            onFail(message);
                                                            return;
                                                        });
                                                    } else {
                                                        update_db(function (process, finish) {
                                                            var date = new Date();
                                                            var timestamp = date.getTime();
                                                            var claimUpdateSQL = 'UPDATE public.aditus_deals SET "reimbursedStatus" = ' + "'DONE'" + ',"reimbursedHash"=' + "'" + hash + "' " + ' WHERE "id"=' + "'" + dealId + "';";
                                                            process(claimUpdateSQL, function () {
                                                                var statusUpdateSQL = 'UPDATE public.aditus_reimburser_log SET "status" = ' + "'DONE'" + ' WHERE "hash"=' + "'" + hash + "';";
                                                                process(statusUpdateSQL, function () {
                                                                    finish();
                                                                });
                                                            });
                                                        }, function (res) {
                                                            var message = 'reimbursed ' + reimbursedTokens + ' to wallet#' + partner.walletAddress + ' with tx#' + hash;
                                                            emailNotifier.push({ title: "token reimburser done", message: message });
                                                            console.log(message);
                                                        });
                                                    }
                                                });
                                            });
                                        } else {
                                            var message = 'unable to reimburse ' + reimbursedTokens + ' to wallet#' + partner.walletAddress;
                                            onFail(message);
                                            return;
                                        }
                                    });
                                });

                            }
                        } else {
                            onFail('partner for deal#' + dealId + ' is invalid');
                            return;
                        }
                    });
                });

                if (!claim.txHash) {

                } else {
                    console.log('claim#' + claimId + ' has already been processed!')
                }
            } else {
                console.log('claim#' + claimId + ' does not exist!')
            }
        });
    }

    function _startQueue() {
        var queueName = config.TokenReimburser["QUEUE_NAME"];
        const queue = aditus_queuer(config, queueName);
        queue.register();
        queue.onReceive(function (dealId) {
            _reimburse(dealId);
        })
        console.log(queueName + ' LISTENING');
    }
    return {
        reimburse: _reimburse,
        startQueue: _startQueue
    }
}

var instance = token_reimburser(config);
instance.startQueue();