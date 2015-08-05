var bitcoinjs = require('bitcoinjs-lib');
var basicAuth = require('basic-auth');
var openpublishState = require('openpublish-state')({
  network: "testnet"
});


var serverState = function(options) {
  var app = options.app;
  var commonBlockchain = options.commonBlockchain;
  var dbclient = options.dbclient;
  var express = options.express;

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
            if (tipInfo.tipper === address) {
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
  
  var getUserCommentsAuth = function (req, res, next) {
    function unauthorized(res) {
      res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
      return res.send(401);
    };

    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
      return unauthorized(res);
    };

    if (checkSig(user.name, user.pass, "tiptocomment", bitcoinjs.networks.testnet)) {
      next();
    } else {
      return unauthorized(res);
    };
  };

  var getPostCommentsAuth = function (req, res, next) {
    function unauthorized(res) {
      res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
      return res.send(401);
    };

    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
      return unauthorized(res);
    };

    if (checkSig(user.name, user.pass, "tiptocomment", bitcoinjs.networks.testnet) && req.query.address === user.name) {
      next();
    } else {
      return unauthorized(res);
    };
  };




  app.get('/', function (req, res, next) {
    res.end("hello world");
  });

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
        }
      });
    }
    else {
      var err = new Error("Missing parameters to comment");
      err.status = 500;
      next(err);
    }
  });

  app.get('/getAddressComments', getUserCommentsAuth, function (req, res, next) {
    if (req.query.address) {
      var address = req.query.address;
      getCommentsByUser(address, function (err, response) {
        if (err) {
          var err = new Error(err);
          err.status = 500;
          next(err);
        }
        else {
          res.send(JSON.stringify(response));
        }
      });
    }
    else {
      var err = new Error("You must specify an address");
      err.status = 500;
      next(err);
    }
  });

  app.get('getPostComments', getPostCommentsAuth, function (req, req, next) {
    if (req.query.sha1) {
      checkTip(req.query.sha1, req.query.address, function (err, hasTipped) {
        if (hasTipped) {
          getCommentsByPost(req.query.sha1, function (err, response) {
            if (err) {
              var err = new Error(err);
              err.status = 500;
              next(err);
            }
            else {
              res.send(response);
            }
          });
        }
        else {
          var err = new Error("Invalid method of retrieving comments.");
          err.status = 500;
          next(err);
        }
      });
    }
    else {
      var err = new Error("You must specify a sha1");
      err.status = 500;
      next(err);
    }
  });



  //   else {
  //     var signature = req.body.signature;
  //     var address = req.body.address;
  //     var network = (req.body.network === "testnet") ? bitcoinjs.networks.testnet : null;

  //     var options = {signature: signature, address: address, network: network, body: "tiptocomment"};

  //     validate(options, function (err, isValid) {
  //       if (isValid) {
  //         if (method === "sha1" && param) {
  //           var sha1 = param;
  //           getCommentsByPost(sha1, function (err, response) {
  //             if (err) {
  //               var err = new Error(err);
  //               err.status = 500;
  //               next(err);
  //             }
  //             else {
  //               res.end(response);
  //             }
  //           });
  //         }
  //         else {
  //           var err = new Error("Invalid method of retrieving comments.");
  //           err.status = 500;
  //           next(err);
  //         }
  //       }
  //       else {
  //         var err = new Error("User has either not tipped or not authenticated properly");
  //         err.status = 500;
  //         next(err);
  //       }
  //     });
  //   }
  // });   
};


module.exports = serverState;