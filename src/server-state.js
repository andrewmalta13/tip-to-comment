var bitcoinjs = require('bitcoinjs-lib');
var openpublishState = require('openpublish-state')({
  network: "testnet"
});


var serverState = function(options) {
  var app = options.app;
  var commonBlockchain = options.commonBlockchain;
  var dbclient = options.dbclient;
  

  //returns true if the signature was indeed created by specified address, false otherwise.
  //NOTE: network should be a bitocoinjs-lib network object (for testnet) or null for mainnet/
  function checkSig (address, signature, message, network) {
    return(bitcoinjs.Message.verify(address, signature, message, network));
  }
  
  //checks to see if the address has tipped the sha1 and hits the callback with (err (string or false), hasTipped (boolean))
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
        else if (tipInfo.tips.length === 0) {
          callback("user has not tipped", false);
        }
        else{
          var tipCount = 0;
          tipInfo.tips.forEach(function (tip) {
            console.log(tipCount, tipInfo.tips.length);
            if (tip.sourceAddresses[0] === address) {
              callback(false, true);
            }
            else if (++tipCount === tipInfo.tips.length) {
              console.log("user has not tipped");
              callback("user has not tipped", false);
            }
          });
        }
      }
    });
  }
  
  //checks both to see if a user is who they say they are as well if they have tipped the specified sha1.
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
  

  //comments on a specified sha1 if validation is successful, otherwise do nothing.
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
            callback(false, options);
          }
        });
      }
      else {
        callback(err, false);
      }
    });
  }
  
  //returns the comments on a particular sha1.
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
  
  //returns the comments made by a specified user.
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
  
  //comment handler.
  app.post('/comment', function (req, res, next){
    if(req.body.address && req.body.signature && req.body.comment && req.body.network && req.body.sha1) {
      comment(req.body, function (err, comment) {
        if (err) {
          res.status(200).send(err);
          res.end();
        }
        else {
          res.status(200).send(comment);
          res.end();
        }
      });
    }
    else {
      res.status(200).send('Missing arguments to comment!');
      res.end();
    }
  });

  /* This is the handler for a strict check on the user having authenticated and tipped. We will be using this code
     once we have web hooks workign with bsync, but as of now it is very harsh to the user experience as bsync takes
     a couple of minutes to register a tip (on teststnet) and about 10 minutes on mainnet. The code for getComments
     right now is not checking for auth nor is it checking for a tip. This will enable the users to view comments without
     having tipped
  */
  // app.get('/getComments/:method/:param', function (req, res, next) {
  //   var method = req.params["method"];
  //   var param = req.params["param"];

  //   var signature = req.header('signature');
  //   var address = req.header('address');
  //   var network = req.header('network');

  //   if(!signature || !address || !network) {
  //     res.status(200).send('Missing arguments to retrieve comments!');
  //     res.end();
  //   }
  //   else if (method === "address" && param) {
  //     var queryAddress = param;
  //     network = (network === "testnet") ? bitcoinjs.networks.testnet : null;
      
  //     if (checkSig(address, signature, queryAddress, network)) {
  //       getCommentsByUser(queryAddress, function (err, response) {
  //         if (err) {
  //           res.status(200).send(err);
  //           res.end();
  //         }
  //         else {
  //           res.status(200).send(response);
  //           res.end();
  //         }
  //       });
  //     }
  //     else {
  //      res.status(200).send('Authentication Failed!');
  //      res.end();
  //     }    
  //   }
  //   else if (method === "sha1" && param) {
  //     var sha1 = param;
  //     network = (network === "testnet") ? bitcoinjs.networks.testnet : null;
  //     var options = {address: address, signature: signature, network: network, body: param, sha1: sha1};
  //     validate(options, function (err, isValid) {
  //       if (isValid) {
  //         getCommentsByPost(sha1, function (err, response) {
  //           if (err) {
  //             res.status(200).send(err);
  //             res.end();
  //           }
  //           else {
  //             res.status(200).send(response);
  //             res.end();
  //           }
  //         });
  //       }
  //       else {
  //         res.status(200).send(err);
  //         res.end();
  //       }
  //     });
  //   }
  //   else {
  //     res.status(200).send("Method not defined");
  //     res.end();
  //   }
  // });  
  
  // this is a handler to get comments (while waiting on hooks from bsync you don't have to validate() to see comments)
  // method can be either "sha1" or "address". sha1 will query by post and address will query by user. Param should either be
  // the particular sha1 or public address you are looking to query.
  app.get('/getComments/:method/:param', function (req, res, next) {
    var method = req.params["method"];
    var param = req.params["param"];

    var address = req.header('address');
    var network = req.header('network');

     if (method === "address" && param) {
      var queryAddress = param;
      getCommentsByUser(queryAddress, function (err, response) {
        if (err) {
          res.status(200).send(JSON.stringify(err));
          res.end();
        }
        else {
          res.status(200).send(JSON.stringify(response));
          res.end();
        }
      });
    }
    else if (method === "sha1" && param) {
      var sha1 = param;
      getCommentsByPost(sha1, function (err, response) {
        if (err) {
          res.status(200).send(err);
          res.end();
        }
        else {
          res.status(200).send(response);
          res.end();
        }
      });   
    }
    else {
      res.status(200).send("Method not defined");
      res.end();
    }
  });    


  //gets the number of comments on a particular sha1.
  app.get('/getNumComments/:sha1', function (req, res, next) {
    if(req.params['sha1']) {
      getCommentsByPost(req.params['sha1'], function (err, comments) {
        if (err) {
          res.status(200).send(err);
          res.end();
        }
        else {
          res.status(200).send("" + comments.length);
          res.end();
        }
      });
    }
    else {
      res.status(200).send("no sha1 specified");
      res.end();
    }
  });
};


module.exports = serverState;