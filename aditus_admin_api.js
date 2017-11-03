var express = require('express');
var app = express();
var bodyParser = require('body-parser');


var config = require('./aditus_admin_config.json');

const reimburser = aditus_queuer(config,config["TOKEN_REIMBURSER_QUEUE_NAME"]);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8081;

var router = express.Router();


router.post('/reimburse', function (req, res) {
    try {
        var dealId = req.body.dealId;
        if (!dealId)
            throw err;

        reimburser.push(dealId);
        res.json({
            success: true,
            message: "reimbrusement queued"
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "no dealId provided"
        });
    }
});


app.use('/adminapi', router);

app.listen(port);
console.log('ADMIN API on port ' + port);
