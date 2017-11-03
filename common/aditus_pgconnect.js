const pg = require('pg');

function pgconnect(conStr) {
    const CONST_CONNECTION_STR = conStr;
    const pool = new pg.Pool({
        connectionString: CONST_CONNECTION_STR
    })
    
    function _query_db(sql,onDone) {
        pg.connect(CONST_CONNECTION_STR, (err, client, done) => {
            if(err) {
                done();
                throw err;
            }
            var values = [];
            if (typeof sql === "object") {
                values = sql.values;
                sql = sql.query;
            }
            const query = client.query(sql, values);
    
            var results = [];
            query.on('row', (row) => {
                results.push(row);
            });
    
            query.on('end', () => {
                done();
                onDone(results);
            });
        });
    }
    
    function _update_db(onProcess,onDone) {
        pool.connect((err, client, done) => {
            if(err) {
                done();
                throw err;
            }
    
            var onErrorCallback = (qErr) => {
                if (qErr) {
                    console.error('Error in transaction', qErr.stack)
                    var errorThrown = false;
                    client.query('ROLLBACK', (rbErr) => {
                        if (rbErr) {
                            console.error('Error rolling back client', err.stack)
                        }
                        // release the client back to the pool
                        done()
                        if (rbErr) {
                            errorThrown = true;
                            throw rbErr;
                        }
                    })
    
                    if (!errorThrown) {
                        throw qErr;
                    }
                }
            }
    
            client.query('BEGIN', (tErr) => {
                if (tErr) {
                    onErrorCallback(tErr)
                    return;
                }
    
                var transactionProcess = function(sql,cb) {
                    var values = [];
                    if (typeof sql === "object") {
                        values = sql.values;
                        sql = sql.query;
                    }
                    client.query(sql, values, (lErr, res) => {
                        if (lErr) {
                            onErrorCallback(lErr);
                        } else {
                            cb(res);
                        }
                    });
                }
                onProcess(transactionProcess, function() {
                    client.query('COMMIT', (cErr) => {
                        if (cErr) {
                            console.error('Error committing transaction', err.stack)
                        }
                        done();
    
                        if (!cErr)
                            onDone(true);
    
                        onErrorCallback(cErr);
                    })
                });
            })
        })
    }
    
    return {
        query_db: _query_db,
        update_db: _update_db
    }
}

module.exports = pgconnect;