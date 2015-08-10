var bitcoinjs = require('bitcoinjs-lib');
var openpublishState = require('openpublish-state')({
  network: "testnet"
});


var serverState = function(options) {
  var app = options.app;
  var commonBlockchain = options.commonBlockchain;
  var dbclient = options.dbclient;

  function checkSig (address, signature, message, network) {
    return(bitcoinjs.Message.verify(address, signature, message, network));
  }
  
  function checkTip(sha1, address, callback) {
    openpublishState.findTips({sha1: sha1}, function (err, tipInfo) {
      if (err) {
        callback(err, tipInfo);
      }
      else {
        //the owner is tyring to comment. Let him.
        if (tipInfo.tips.length > 0 && (tipInfo.tips[0].destination === address)) {
          callback(false, true);
        }
        else {
          for (var i = 0; i < tipInfo.tips.length; i++) {
            if (tipInfo.tips[i].sourceAddresses[0] === address) {
              callback(false, true);
            }
          }
          callback("user has not tipped", false);
        }
      }
    });
  }

  function validate(options, callback) {
    var isValidSig = checkSig(options.address, options.signature, options.body, options.network);
    if (isValidSig) {
      checkTip(options.sha1, options.address, function (err, hasTipped) {
        callback(err, hasTipped);
      });
    }
    else {
      callback("invalid signature", false);
    }
  }

  function comment(options, callback) {
    options.body = options.comment;
    options.network = (options.network === "testnet") ? bitcoinjs.networks.testnet : null;

    validate(options , function (err, isValid) {
      if (isValid) {
        dbclient.query("INSERT INTO comments VALUES ($1, $2, $3, NOW())", [options.sha1, options.address, options.comment], function (err, result) {
          if (err) {
            callback(err, false);
          }
          else {
            callback(false, options.comment)
          }
        });
      }
      else {
        callback(err, false);
      }
    });
  }

  function getCommentsByPost(sha1, callback) {
    dbclient.query("SELECT * FROM comments WHERE sha1 = $1", [sha1], function (err, result) {
      if (err) {
        callback(err, null)
      }
      else {
        callback(err, result.rows);
      }
    });
  }

  function getCommentsByUser(address, callback) {
    dbclient.query("SELECT * FROM comments WHERE commenter = $1", [address], function (err, result) {
      if (err) {
        callback(err, null)
      }
      else {
        callback(err, result.rows);
      }
    });
  }

  app.post('/comment', function (req, res, next){
    if(req.body.address && req.body.signature && req.body.comment && req.body.network && req.body.sha1) {
      comment(req.body, function (err, comment) {
        if (err) {
          var err = new Error(err);
          err.status = 500;
          next(err);
        }
        else {
          res.status(200).send(comment);
          res.end();
        }
      });
    }
    else {
      res.status(500).send('Missing arguments to comment!');
      res.end();
    }
  });

  app.get('/getComments/:method/:param', function (req, res, next) {
    var method = req.params["method"];
    var param = req.params["param"];

    var signature = req.header('signature');
    var address = req.header('address');
    var network = req.header('network');

    if(!signature || !address || !network) {
      res.status(500).send('Missing arguments to retrieve comments!');
    }
    else if (method === "address" && param) {
      var queryAddress = param;
      network = (network === "testnet") ? bitcoinjs.networks.testnet : null;
      
      if (checkSig(address, signature, queryAddress, network)) {
        getCommentsByUser(queryAddress, function (err, response) {
          if (err) {
            res.status(500).send(err);
            res.end();
          }
          else {
            res.send(response);
            res.end();
          }
        });
      }
      else {
       res.status(500).send('Authentication Failed!');
       res.end();
      }    
    }
    else if (method === "sha1" && param) {
      var sha1 = param;
      network = (network === "testnet") ? bitcoinjs.networks.testnet : null;
      var options = {address: address, signature: signature, network: network, body: param, sha1: sha1};
      validate(options, function (err, isValid) {
        if (isValid) {
          getCommentsByPost(sha1, function (err, response) {
            if (err) {
              res.status(500).send(err);
            }
            else {
              res.send(response);
              res.end();
            }
          });
        }
        else {
          res.status(500).send("User has either not tipped or not authenticated properly");
          res.end();
        }
      });
    }
    else {
      res.status(500).send("Method not defined");
      res.end();
    }
  });   

  app.get('/getNumComments/:sha1', function (req, res, next) {
    if(req.params['sha1']) {
      getCommentsByPost(req.params['sha1'], function (err, comments) {
        if (err) {
          res.status(500).send(err);
          res.end();
        }
        else {
          res.send("" + comments.length);
          res.end();
        }
      });
    }
    else {
      res.status(500).send("no sha1 specified");
      res.end();
    }
  });
};


module.exports = serverState;