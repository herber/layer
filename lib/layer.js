//setup express
const express = require('express');
const app = express();

//setup fs
const fs = require('fs');

//setup serve controller
const serve = require('./serve');

//setup ejs
app.set('view engine', 'ejs');

//setup static files
app.use(express.static('./public'));

//start serve
serve(app);

//listen to port
app.listen(80 || process.env.PORT);

console.log('listening to port ' + 80 || process.env.PORT);
