#!/usr/bin/env node
const yargs = require("yargs");

var builder = require("./builder");
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

let templateFile = (argv.t) ? argv.t : "serverless_template.yml";



//console.log(graphql);

builder.generateServerlessFunction(`./${templateFile}`);
