#!/usr/bin/env node
const yargs = require("yargs");
const { getTsconfig } = require('get-tsconfig');

var builder = require("./builder");
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

let templateFile = (argv.t) ? argv.t : "serverless_template.yml";

let sourcePath;
// tsconfig.json이 존재할 경우 빌드 결과가 저장된 경로를 사용하도록 함
try {
    let tsconfig = getTsconfig();
    if (tsconfig !== null) {
        sourcePath = `./${tsconfig.config.compilerOptions.outDir}/src/lambda`
    }
} catch (error) {}

if (argv.n) {
    builder.uploadToNotion(argv.n, sourcePath);
}
else {
    sourcePath = sourcePath || "./src/lambda";
    (argv.x) ? builder.generateExportFile(sourcePath) : builder.generateServerlessFunction(`./${templateFile}`, sourcePath);
}
//console.log(graphql);


