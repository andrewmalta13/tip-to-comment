var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var app = express();
var cors = require('cors');
var serverState = require('./server-state.js');
var pg = require('pg');

var commonblockchain = require('blockcypher-unofficial')({
  key: process.env.KEY,
  network: "testnet"
});

app.use(cors());

app.set('port', (process.env.PORT || '3000'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var server = app.listen((process.env.PORT || '3000'), function () {
  console.log('Listening on port %d', server.address().port);
});

var connectionString = process.env.DATABASE_URL;
var dbclient = new pg.Client(connectionString);
dbclient.connect(function(err){
  if (err) {
    console.error("error connecting to database" + err);
  }
});

serverState({
  app: app,
  express: express,
  commonBlockchain: commonblockchain,
  dbclient: dbclient
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});


// production error handler
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  next(err);
});

module.exports = app;
