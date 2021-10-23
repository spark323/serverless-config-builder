var AWS = require("aws-sdk");
const axios = require('axios').default;
AWS.config.update({
    region: "ap-northeast-2"
});
var Base64 = require('js-base64').Base64;
var moment = require('moment-timezone');
const yaml = require('js-yaml');
const fs = require('fs');
const fspr = require('fs').promises;
var path = require('path')
const JSON5 = require('json5')
async function getFileListFromLocal(dir, arr) {
    const result = await fspr.readdir(dir);
    let prom = result.map(async (file) => {
        file = path.resolve(dir, file);
        const element = await fspr.stat(file);
        if (element.isDirectory()) {
            const newar = await getFileListFromLocal(file, arr);
            arr.concat(newar);
        }
        else {
            arr.push({ path: file, type: "local" })
        }
    })
    await Promise.all(prom);
    return arr;
}
function getOutputs(data) {
    let obj = {};
    const stack = data.Stacks[0].Outputs;
    stack.forEach(element => {
        const key = element.OutputKey;
        obj[key] = element.OutputValue;
    });
    return obj;
}
async function generateGraphQL() {

    const apiSpecList = await getApiSepcList();
    let graphQLs = { query: [], mutation: [] };
    for (var property in apiSpecList) {
        let apiSpec = apiSpecList[property];
        //console.log(apiSpec);
        apiSpec.forEach(async (obj) => {
            const item = obj.item;
            if (item) {
                if (item.graphql == true) {
                    if (item.method.toLowerCase() == "get") {
                        graphQLs.query.push({ name: item.name, method: item.method });
                    }
                    else {
                        graphQLs.mutation.push({ name: item.name, method: item.method });
                    }
                }
            }
        });
    }
    let yamlStr = yaml.dump(graphQLs);
    fs.writeFileSync(`graphqls.yml`, yamlStr, 'utf8');
}
async function generateServerlessFunction(templateFile, stage) {

    const apiSpecList = await getApiSepcList();
    await printServerlessFunction(stage, templateFile, apiSpecList);
}

function replaceHttpMethod(_str) {
    let str = _str.replace("/post", "");
    str = str.replace("/get", "");
    str = str.replace("/put", "");
    str = str.replace("/delete", "");
    return str;

}
function replaceAll(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}
async function getApiSepcList() {
    let cnt = 0;
    let files = await getFileListFromLocal("./src/lambda", []);
    //console.log(files);
    let apiSpecList = { "nomatch": [], "error": [] };
    files.forEach((fileItem) => {
        const path = fileItem.path;
        try {
            let utf8 = undefined;
            let category = "";
            let name = "";
            let file = undefined;
            if (fileItem.type == "local") {
                name = path.replace(".js", "");
                name = replaceAll(name, "\\\\", "/");
                let nameArr = name.split("/");

                const idxLambda = nameArr.indexOf("lambda");
                nameArr = nameArr.slice(idxLambda - 1);
                name = nameArr.slice(2).join("/");
                category = nameArr[2];
                try {
                    file = fs.readFileSync(path);
                }
                catch (e) {
                    console.error(e);
                }
                utf8 = file.toString('utf8');
            }
            //  const decoded = Base64.decode(fileContentEncoded)
            let regexstr = `(?<=apiSpec = )((.|\n|\r)*?)(?=\;)`;
            var regex = new RegExp(regexstr, "g");
            var matches = utf8.matchAll(regex)
            const matchArray = Array.from(matches);
            if (matchArray.length > 0) {
                try {
                    let obj = require(path).apiSpec;
                    category = obj.category;
                    obj["name"] = name;
                    obj["uri"] = replaceHttpMethod(name);
                    //console.log(cnt++, path, obj);
                    if (!apiSpecList[category]) {
                        apiSpecList[category] = [];
                    }
                    apiSpecList[category].push({ path: path, item: obj })
                } catch (e) {
                    apiSpecList["error"].push({ path: path, obj: "error" })
                    //console.log(match[0]);
                    // console.error(path);
                    //console.error(e);
                }
            }
            else {

                //console.log(cnt++, path, "\u001b[1;31m no_match")
                apiSpecList["nomatch"].push({ path: path, obj: "no_match" })
            }
        }
        catch (e) {
            apiSpecList["error"].push({ path: path, obj: "error" })

        }
    });
    return apiSpecList;
}


function createPostmanImport(apiSpecList, title, stage, _version, host) {
    const projectInfo = yaml.load(fs.readFileSync('./info.yml', "utf8"));
    const description = projectInfo.description;
    const contact = projectInfo.contact;
    const version = `${stage}-${_version}`;
    const servers = [{ url: host }];
    const schemes = ["https"];
    let paths = {};
    const obj = sortApiSpecListByPath(apiSpecList);
    //console.log(obj);
    for (var property in obj) {
        paths[property] = {};
        for (var method in obj[property]) {
            const api = obj[property][method];
            paths[property][method] = {};
            paths[property][method].descroption = api.desc;
            if (!api.noAuth) {
                paths[property][method].security =
                    [{
                        bearerAuth: ["test"]
                    }]
            }
            paths[property][method].parameters = [];
            if (method == "get" || method == "delete") {
                for (var parmName in api.parameters) {
                    const parm = api.parameters[parmName];

                    paths[property][method].parameters.push(
                        {
                            name: parmName,
                            in: "query",
                            description: parm.desc,
                            required: parm.req,
                            schema: { type: parm.type.toLowerCase() }
                        }
                    )

                }
            }
            if (method == "post" || method == "put") {
                let requireds = [];
                let proprs = {};
                for (var parmName in api.parameters) {
                    const parm = api.parameters[parmName];
                    if (parm.req) {
                        requireds.push(parmName);
                    }
                    proprs[parmName] = {
                        type: parm.type
                    }
                }
                paths[property][method].requestBody = {
                    required: true,
                    content: {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": requireds,
                                "properties": proprs,
                            }
                        }
                    }
                }

            }

        }
    }
    const all = {
        "openapi": "3.0.0",
        info: {

            version: version,
            title: `${title}(${stage})`,
            description: description,
            contact: contact,

        },
        servers: servers,
        paths: paths,
        components: {
            securitySchemes:
            {
                bearerAuth:
                {
                    type: "http",
                    scheme: "bearer"
                }
            }
        }
    }
    return (JSON.stringify(all));
}
function sortApiSpecListByPath(apiSpecList) {
    let obj = {};
    for (var category in apiSpecList) {
        const prop = apiSpecList[category];
        prop.forEach((itemt) => {
            const item = itemt.item;
            if (!item || !item.type || item.hide || !item.method) {
                return;
            }
            if (!obj[item.uri]) {
                obj[item.uri] = [];
            }
            obj[item.uri][item.method.toLowerCase()] = item;
        })
    }
    return obj;
}
async function printServerlessFunction(stage, templateFile, apiSpecList) {
    let serverlessTemplet1 = yaml.load(fs.readFileSync(templateFile, "utf8"))
    let functions = {};
    for (var property in apiSpecList) {
        let apiSpec = apiSpecList[property];
        if (apiSpec.length > 0) {
            apiSpec.forEach(async (obj) => {
                const item = obj.item;
                if (item && (item.method) && (!item.disabled)) {
                    const nameArr = item.name.split("/");
                    let funcObject = {};
                    if (item.type == "websocket") {
                        funcObject = {
                            name: `\${self:app}_\${opt:stage, "dev"}\${opt:ver, "1"}_${nameArr.join("_")}`,
                            handler: `src/lambda/${item.name}.handler`,
                            //alarms: ["scan500Error"],
                            alarms: [{ name: "functionErrors", enabled: (stage == "prod") ? true : false }],
                            events: [
                                {
                                    websocket: {
                                        route: `${item.route}`,
                                    }
                                }
                            ]
                        }
                    }
                    else if (item.type == "s3") {
                        funcObject = {
                            name: `\${self:app}_\${opt:stage, "dev"}\${opt:ver, "1"}_${nameArr.join("_")}`,
                            handler: `src/lambda/${item.name}.handler`,
                            // alarms: ["scan500Error"],
                            alarms: ["functionErrors"],
                            events: [
                                {
                                    s3: {
                                        bucket: `${item.event.bucket}`, event: item.event.event,
                                        existing: (item.event.existing) ? item.event.existing : false
                                    }
                                }
                            ]
                        }

                    }
                    else {
                        funcObject = {
                            name: `\${self:app}_\${opt:stage, "dev"}\${opt:ver, "1"}_${nameArr.join("_")}`,
                            handler: `src/lambda/${item.name}.handler`,
                            //alarms: ["scan500Error"],
                            alarms: [{ name: "functionErrors", enabled: (stage == "prod") ? true : false }],
                            events: [
                                {
                                    http: {
                                        path: `${item.uri}`,
                                        method: `${item.method.toLowerCase()}`,
                                        cors: true,
                                    }
                                }
                            ]
                        }
                    }
                    if (item.layer) {
                        funcObject["layers"] = [item.layer]
                    }
                    if (item.sqs) {
                        funcObject["events"].push({
                            sqs: { arn: { "Fn::GetAtt": [item.sqs, "Arn"] } }
                        })
                    }
                    if (item.timeout) {
                        funcObject["timeout"] = parseInt(item.timeout);
                    }
                    functions[`${nameArr.join("_")}`] = funcObject;
                }
            });
        }
    }
    serverlessTemplet1.functions = functions;
    let yamlStr = yaml.dump(serverlessTemplet1);
    fs.writeFileSync(`serverless.yml`, yamlStr, 'utf8');
}
async function updateDoc(stack, stage, version, title, confluenceSpaceName, confluencePageId, ancestorsPageId, confluenceUserId, confluencePassword) {

    const info = getOutputs(stack);

    let files = await getFileListFromLocal("./src/lambda", []);
    const apiSpecList = await getApiSepcList(files);



    await updateDocument(info.ServiceEndpoint, stage, version, title, apiSpecList, confluenceSpaceName, confluencePageId, ancestorsPageId, confluenceUserId, confluencePassword)
}
async function handleCommit(stackname, stage, version, title, repoName, branch, confluenceSpaceName, confluencePageId, ancestorsPageId, confluenceUserId, confluencePassword) {

    console.log("stackname", stackname);

    var cloudformation = new AWS.CloudFormation();

    var params = {

        StackName: stackname
    };
    //const stack=await  cloudformation.describeStacks(params).promise();

    const stack = await cloudformation.describeStacks(params).promise();

    const info = getOutputs(stack);



    var params = {
        commitSpecifier: branch,
        folderPath: 'src/lambda', /* required */
        repositoryName: repoName, /* required */
    };
    let files = await getFileListFromLocal("./src/lambda", []);
    const apiSpecList = await getApiSepcList(files);



    await updateDocument(info.ServiceEndpoint, stage, version, title, apiSpecList, confluenceSpaceName, confluencePageId, ancestorsPageId, confluenceUserId, confluencePassword)
}
async function updateDocument(host, stage, version, title, apiSpecList, confluenceSpaceName, confluencePageId, ancestorsPageId, confluenceUserId, confluencePassword) {
    let cnt = 0;
    //HTML 작성
    let html = "";
    html += `<br></br>`;
    html += `<p><b>수정시간</b>:${moment().tz("Asia/Seoul").format("YYYY-MM-DD HH:mm:ss")}</p>`;
    html += `<p><b>버전</b>:${stage}-${version}</p>`;
    html += `<p><b>host</b>:${host}</p>`;
    let errorTitles = [];
    let errorValues = [];
    let apiName = [];
    for (var property in apiSpecList) {
        let htmlTable = "";
        let apiCount = 0;
        let apiSpec = apiSpecList[property];
        if (apiSpec.length < 1) {

        } else {
            cnt = 0;
            htmlTable += `<br></br>`;
            htmlTable += `<p>category:${property}</p>`;
            htmlTable += `<table class="wrapped relative-table" >`;
            htmlTable += `
            <colgroup> 
            <col style="width: 3.09584%;"/>
            <col style="width: 5.72519%;"/> 
            <col style="width: 6.70059%;"/> 
            <col style="width: 7.88804%;"/> 
            <col style="width: 3.54877%;"/> 
            <col style="width: 10.8363%;"/> 
            <col style="width: 20.2061%;"/> 
            <col style="width: 20.3478%;"/>
            <col style="width: 3.6514%;"/> 
            <col style="width: 8.6514%;"/> 
            <col style="width: 8.6514%;"/> 
            </colgroup>`;

            htmlTable += `<tbody>`;


            htmlTable += `<tr><td style="text-align: center;">
            <p align="center">번호</p>
            </td>
            <td colspan="1" style="text-align: center;">
            <p align="center">종류</p> 
            </td>
            <td style="text-align: center;">
            <p align="center">명칭</p>
            </td>
            <td colspan="1" style="text-align: center;">
            <p align="center">API_URI</p>            
            </td>
            <td colspan="1" style="text-align: center;">
            <p align="center">Method</p>   
            </td>
            <td style="text-align: center;">
            <p align="center">기능</p>
            </td>
            <td colspan="1" style="text-align: center;">
            <p align="center">요청 파라메터 리스트</p>
            </td>
            <td colspan="1" style="text-align: center;">
            <p align="center">응답 키 리스트</p>
            </td>
            <td colspan="1" style="text-align: center;">
            <p align="center">인증 필요 여부</p>
            </td>
            <td colspan="1" style="text-align: center;">
            <p align="center">에러목록</p>
            </td>
            
            <td colspan="1" style="text-align: center;">
            <p align="center">비고</p>
            </td>
            
            </tr>`;
            apiSpec.forEach((obj) => {
                const item = obj.item;
                htmlTable += `<tr>`;
                if (!item) {
                    htmlTable += `<td colspan="1" style="text-align: center;">${cnt++}</td>`   //번호
                    htmlTable += `<td colspan="1" style="text-align: center;">unknown</td>`   //종류
                    htmlTable += `<td colspan="1" style="text-align: center;">${obj.path}</td>`  //명칭
                }
                else if (item.hide) {
                }
                else if (!item.type) {
                    htmlTable += `<td colspan="1" style="text-align: center;">${cnt++}</td>`   //번호
                    htmlTable += `<td colspan="1" style="text-align: center;">unknown</td>`   //종류
                    htmlTable += `<td colspan="1" style="text-align: center;">${obj.path}</td>`  //명칭
                }
                else {
                    apiCount++;
                    htmlTable += `<td colspan="1" style="text-align: center;">${cnt++}</td>`   //번호
                    htmlTable += `<td colspan="1" style="text-align: center;">${item.type}</td>`   //종류
                    htmlTable += `<td colspan="1" style="text-align: center;">${item.name}</td>`  //명칭
                    htmlTable += `<td colspan="1" style="text-align: center;">${item.uri}</td>`  //api_uri
                    htmlTable += `<td colspan="1" style="text-align: center;">${item.method}</td>` //method
                    htmlTable += `<td colspan="1" style="text-align: left;">${item.desc}</td>`//기능

                    htmlTable += `<td>` //요청 파라메터 리스트
                    htmlTable += `<ul>`
                    for (var property in item.parameters) {
                        const obj = item.parameters[property];
                        //minmax
                        let minMax = "";
                        if (obj.min != undefined && obj.max != undefined) {
                            minMax = `(${obj.min}~${obj.max}${obj.type.toLowerCase() == "string" ? "글자" : ""})`;
                        }
                        else if (obj.min != undefined) {
                            minMax = `(${obj.min}~${obj.type.toLowerCase() == "string" ? "글자" : ""})`;
                        }
                        else if (obj.max != undefined) {
                            minMax = `(~${obj.max}${obj.type.toLowerCase() == "string" ? "글자" : ""})`;
                        }
                        htmlTable += `<li style="text-align: left;">${property}[${obj.type}]${!obj.req ? "(Optional)" : ""}:${obj.desc}${minMax == "" ? "" : minMax}</li>`
                        if (obj.sub) {


                            htmlTable += `<ul>`
                            for (var prop in obj.sub) {
                                const obj2 = obj.sub[prop];
                                htmlTable += `<li style="text-align: left;">${prop}[${obj2.type}](${!obj2.req ? "Optional" : ""}):${obj2.desc}</li>`
                            }
                            htmlTable += `</ul>`
                        }
                    }
                    htmlTable += `</ul>`
                    htmlTable += `</td>`
                    htmlTable += `<td>`//응답 파라메터 리스트
                    htmlTable += `<ul>`

                    for (var property in item.responses) {
                        const obj = item.responses[property];
                        htmlTable += `<li style="text-align: left;">${property}[${obj.type}]:${obj.desc}</li>`

                        if (obj.sub) {
                            htmlTable += `<ul>`
                            for (var prop in obj.sub) {
                                const obj2 = obj.sub[prop];
                                htmlTable += `<li style="text-align: left;">${prop}[${obj2.type}]${obj2.searchable ? "(Searchable)" : ""}:${obj2.desc}</li>`
                            }
                            htmlTable += `</ul >`
                        }
                    }
                    htmlTable += `</ul >`
                    htmlTable += `</td>`

                    htmlTable += `<td colspan="1" style="text-align: center;">`
                    htmlTable += item.noAuth ? `<span style="color: rgb(255,0,0);"><b>False</b></span>` : `<span ><b>True</b></span>`;
                    htmlTable += `</td>`

                    htmlTable += `<td colspan="1" style="text-align: center;">`
                    htmlTable += `<ul>`
                    if (item && item.errors) {
                        for (var property in item.errors) {
                            const obj = item.errors[property];

                            apiName.push(item.name)
                            errorTitles.push(property);
                            errorValues.push(obj.reason);

                            htmlTable += `<li style="text-align: left;">${property}(${obj.status_code}):${obj.reason}</li>`

                        }
                    }
                    htmlTable += `</ul>`
                    htmlTable += `</td>`


                    htmlTable += `<td colspan="1" style="text-align: center;">`
                    if (item && item.comment) {

                        htmlTable += `${item.comment}`;
                    }
                    htmlTable += `</td>`



                }
                htmlTable += `</tr>`;
            })
            htmlTable += `</tbody>`
            htmlTable += `</table>`
        }
        if (cnt > 0) {
            html += htmlTable;
        }
    }

    const exportBlock = createPostmanImport(apiSpecList, title, stage, version, host);
    //export
    html += `<br></br>`;
    html += `<p>ErrorCode 목록</p>`;

    html += `<table>`;
    html += `<tbody>`;
    html += `<tr>`;


    html += `<th>`;

    html += "{";

    html += `<br></br>`;

    for (let i = 0; i < errorTitles.length; i++) {


        html += `"${apiName[i]}-${errorTitles[i]}":"${errorValues[i]}",<br></br>`
    }

    html += "}"
    html += `</th>`;
    html += `</tr>`;
    html += `</tbody>`;
    html += `</table>`;

    //--

    html += `<br></br>`;
    html += `<p>postman import json</p>`;

    html += `<table>`;
    html += `<tbody>`;
    html += `<tr>`;


    html += `<th>`;

    html += exportBlock;
    html += `</th>`;
    html += `</tr>`;
    html += `</tbody>`;
    html += `</table>`;


    if (confluenceSpaceName) {

        //getpageVersion

        const confData = await axios({
            method: 'GET',
            url: "https://twinny.atlassian.net/wiki/rest/api/content/" + confluencePageId,
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Basic " + Base64.encode(`${confluenceUserId}:${confluencePassword}`)
            },
        })
        const versionNumber = confData.data.version.number
        try {
            var jsondata = {
                "id": parseInt(confluencePageId),
                "type": "page",
                "title": `${title}-${stage}(${moment().tz("Asia/Seoul").format("MM-DD")})`,
                "ancestors": [{ "id": parseInt(ancestorsPageId) }],
                "space": { "key": confluenceSpaceName },
                "version": { "number": versionNumber + 1 },
                "body": { "storage": { "value": html, "representation": "storage" } }
            };
            const post = await axios({
                method: 'PUT',
                url: "https://twinny.atlassian.net/wiki/rest/api/content/" + confluencePageId,
                data: JSON.stringify(jsondata),
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Basic " + Base64.encode(`${confluenceUserId}:${confluencePassword}`)
                },
            })
            console.log("Basic " + Base64.encode(`${confluenceUserId}:${confluencePassword}`));
            console.log(post);
        }
        catch (e) {
            console.log(e.response.data.message);
        }
    }
}


module.exports.updateDoc = updateDoc;
module.exports.handleCommit = handleCommit;
module.exports.generateServerlessFunction = generateServerlessFunction;
module.exports.generateGraphQL = generateGraphQL;

module.exports.getApiSepcList = getApiSepcList;
