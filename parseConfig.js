var isBase = false;//标记是否基础配置包
var localConfigName = process.argv[2];
if(process.argv.length > 3 && process.argv[3] == "base"){
	isBase = true;
}
console.log("是否基础数据包", isBase)
var xlsx = require("node-xlsx");
var fs = require('fs');
var archiver = require('archiver');
var fileNameList = []; //文件列表
var souceExcel; //excel所在目录
var resBin; //导出resBin目录
var tsBean; //导出ts类目录
var cfgDesc = [];//配置说明
var allCfgClassStr = "";//所有类字符串
var keys = [];//存储key字段
var outputFileName = "";//最后输出的文件名称
var jsonsInBaseDir = [];//位于base目录下的json名

//json文件全局缓存，最后在遍历写入config.bin
//key->jonsArr;
var jsonDic = {};
var jsonOtherDic = {};

initCfg();

//读取配置文件
function initCfg() {
	var data = fs.readFileSync(localConfigName + '.json');
	var str = data.toString();
	str = str.replace(/\\/g, "/");
	var json = JSON.parse(str);
	if(isBase){
		souceExcel = json.souceExcel + "/base";
		outputFileName = "configbase.bin";
	} else{
		souceExcel = json.souceExcel;
		outputFileName = "config.bin";
	}
	resBin = json.resBin;
	tsBean = json.tsBean;
	traverseExcelFileList();
}

function pushJson(jsonName, json) {
	let jsonArr = jsonDic[jsonName];

	if (!jsonArr) {
		jsonDic[jsonName] = [json];
	}
	else {
		jsonArr.push(json);
	}
}
function pushJsonOther(jsonName, fileDesc, str) {
	var obj = jsonOtherDic[jsonName];
	if (!obj) {
		jsonOtherDic[jsonName] = { fileDesc: fileDesc, str: str };
	}
}
function execConfigBin() {
	let folderName = "json/"; //生成json文件夹
	allCfgClassStr = "module qmr\n{\n";
	for (let jsonName in jsonDic) {
		let sheetArray = jsonDic[jsonName];

		if (sheetArray && sheetArray.length > 0) {
			let obj = jsonOtherDic[jsonName];
			let fileDesc = obj.fileDesc;
			writeFile(folderName + jsonName + ".json", JSON.stringify(sheetArray));
			if(isBase || jsonsInBaseDir.indexOf(jsonName) < 0){
				fileNameList.push(jsonName);
				cfgDesc.push(fileDesc);
				allCfgClassStr += obj.str + "\n";//输出ts文件
				//console.log("xxx:", jsonName, sheetArray.length, className);
			}
		}
	}
	allCfgClassStr += "}";
	console.log("文件转换完成了");
	compressZip();
	if(isBase){
		// savetsFile("BaseConfigKeys", creatCfgKeyObject("BaseConfigKeys", fileNameList));
		// 生成BaseBean
		// savetsFile("BaseBean", creatBaseConfig("BaseBean"));
		// let ss = creatCfgEnum("ConfigEnumBase", fileNameList); //生成配置枚举文件
		// savetsFile("ConfigEnumBase", ss);
		//生成ConfigDB
		// savetsFile("ConfigDBBase", allCfgClassStr);
	} else {
		let ss = creatCfgEnum("ConfigEnum", fileNameList); //生成配置枚举文件
		savetsFile("ConfigEnum", ss);
		//生成ConfigDB
		savetsFile("ConfigDB", allCfgClassStr);
	}
}

//遍历一个文件夹里面的excel
function traverseExcelFileList() {
	fileNameList = [];

	const files = fs.readdirSync(souceExcel); //选择一个excel所在文件夹
	files.forEach(function (item, index) {
		var filePath = souceExcel + "/" + item;
		var info = fs.statSync(filePath);
		var inBaseDir = item == "base";
		if (info.isDirectory()) {
			var subFiles = fs.readdirSync(filePath); //选择一个excel所在文件夹
			subFiles.forEach(function (item, index) {
				var ind = item.lastIndexOf(".");
				var fileType = item.slice(ind + 1, item.length);
				if (item.indexOf("~$") == -1 && fileType == "xlsx") //如果是excel文件
				{
					var time = Date.now();
					var list = xlsx.parse(filePath + "/" + item);
					praseExcel(list, inBaseDir);
					console.log(filePath + "/" + item, list.length, "subfile", Date.now() - time, "ms");
				}
			});
		}
		else {
			var ind = item.lastIndexOf(".");
			var fileType = item.slice(ind + 1, item.length);
			console.log("item---"+item)
			if (item.indexOf("~$") == -1 && fileType == "xlsx") //如果是excel文件
			{
				var time = Date.now();
				var list = xlsx.parse(souceExcel + "/" + item);
				praseExcel(list);
				console.log(souceExcel + "/" + item, list.length, Date.now() - time, "ms");
			}
		}
	});
	execConfigBin();
}
//解析一个Excel
function praseExcel(list, inBaseDir = false) {
	let listCount = list.length;

	for (var i = 0; i < listCount; i++) {
		var excleData = list[i].data;
		var fileName = list[i].name;
		var sheetNum = 0;
		var fileArr = fileName.split("_");
		var arrLength = fileArr.length;
		if (arrLength < 2) {
			continue;
		}
		var fileDesc = fileArr[0];
		var fileName2 = fileArr[1];
		var jsonName = fileName2.charAt(0).toLocaleUpperCase() + fileName2.slice(1, fileName2.length);
		var index = jsonName.indexOf("-");
		if (index != -1) {
			jsonName = jsonName.slice(index + 1, jsonName.length);
		}
		if(inBaseDir) {
			jsonsInBaseDir.push(jsonName);
		}
		var commmentArray = excleData[0];
		var typeArray = excleData[1];
		var keyArray = excleData[2];
		var controlArray = excleData[3];//控制导出
		var startRow = 4;//开始数据行
		
		//console.log(jsonName,keyArray);
		setKey(keyArray, controlArray);
		for (var j = startRow; j < excleData.length; j++) {
			var curData = excleData[j];
			if (curData.length == 0 || curData[0] == undefined) {
				continue;//当前行没有数据 或者当前行第一个字段没数据 不应该导出
			}
			var item = changeObj(curData, typeArray, keyArray, controlArray);
			sheetNum++;
			pushJson(jsonName, item);
		}
		if (sheetNum > 0) {
			var className = jsonName + "Cfg"; //转换为类名
			var str = linkStr(className, keyArray, typeArray, commmentArray, controlArray); //输出ts文件
			pushJsonOther(jsonName, fileDesc, str);
		}
	}
}

//转换数据类型 curData-值 typeArray-类型 keyArray-键 
function changeObj(curData, typeArray, keyArray, controlArray) {
	var obj = {};
	var len = curData.length;
	for (var i = 0; i < len; i++) {
		var controlMark = controlArray[i];
		if (curData[i] != undefined && curData[i] !== "")//空内容不导出
		{
			if (!controlMark || controlMark.toLocaleUpperCase() == "CS" || controlMark.toLocaleUpperCase().indexOf("KEY") != -1 || controlMark.toLocaleUpperCase() == "C")//留空或者C
			{
				obj[keyArray[i]] = changeValue(curData[i], typeArray[i]);

			}
		}
	}
	//console.log("curData[i]"+len+" " + obj);
	return obj;
}

function setKey(keyArray, controlArray) {
	var len = keyArray.length;
	
	for (var i = 0; i < len; i++) {
		var controlMark = controlArray[i];
		if (controlMark) {
			controlMark = controlMark.toLocaleUpperCase();
			if (controlMark.indexOf("KEY") != -1) {
				keys.push(keyArray[i]);
			}
		}
	}
	if (keys.length == 0)//没有手动设置key 默认带个key过来
	{
		keys.push(keyArray[0]);
	}
}

function getKey() {
	var key = "";
	if (keys.length == 0) {
		key = "";
	}
	else {
		if (keys.length == 1) {
			key = keys[0];
		}
		else {
			for (var i = 0; i < keys.length; i++) {
				if (i != keys.length - 1) {
					key += keys[i] + "_";
				}
				else {
					key += keys[i];
				}
			}
		}
	}
	return key;
}

function changeValue(value, type) {
	if (value == null || value == "null") return "";

	if (type) {
		type = trim(type);
		type = type.toLocaleLowerCase();//类型转为小写
		if (type == "int") return Math.floor(value);
		if (type == "long") return Math.floor(value);
		if (type == "number") return value;
		if (type == "string") return value.toString();
		if (type == "array") return value.split("|");
	}
}

//去掉前后空格
function trim(str)  {
	return str.replace(/(^\s*)|(\s*$)/g, "");
}

//写文件
function writeFile(fileName, data) {
	fs.writeFileSync(fileName, data, 'utf-8');
}

//压缩成zip
function compressZip() {
	var output = fs.createWriteStream(resBin + '/' + outputFileName);
	var archive = archiver('zip', {
		zlib: {
			level: 9
		} // Sets the compression level.
	});
	archive.on('error', function (err) {
		throw err;
	});
	output.on('close', function () {
		console.log('压缩完毕！');
		deleteFolder('json', null);
		if(!isBase){
			//createClassHookWindowFile("CfgHookWindow");
		}
	});
	archive.pipe(output);
	archive.directory('json/', false);
	archive.finalize();
}

//字符拼接生成类
function linkStr(className, atrName, atrValue, commmentArray, controlArray) {
	var key = getKey();
	var str = "";
	str += "\texport class " + className + " extends BaseBean" + "\n"; //类名
	str += "\t{" + "\n";
	str += "\t" + creatAttr(atrName, atrValue, commmentArray, controlArray) + "\n";
	str += "\t\t" + "constructor(element)" + "\n";
	str += "\t\t" + "{";
	str += "\t\t" + "\t" + "\t" + "\n";
	str += "\t\t" + "\t" + "super(element)" + "\n";
	str += "\t" + key == "" ? "" : "\t" + "\t" + "this.key=" + '"' + key + '";' + "\n";
	str += "\t\t" + "}" + "\n";
	str += "\t}" + "\n";
	keys = [];
	return str;
}

function creatAttr(atrName, atrValue, commmentArray, controlArray) {
	let str = "";
	let controlMark = "";
	atrName.forEach((element, index) => {
		controlMark = controlArray[index];
		if (!controlMark || controlMark.toLocaleUpperCase() == "CS" || controlMark.toLocaleUpperCase().indexOf("KEY") != -1 || controlMark.toLocaleUpperCase() == "C") {
			str += "\t" + "/**" + commmentArray[index] + "*/" + "\n";//描述字段
			str += "\t" + creatGetAttrFunStr(element, changeAttrType(atrValue[index]));
		}
	});
	return str;
}

function creatGetAttrFunStr(attrKey, attrType) {
	attrKey = trim(attrKey);
	let str = "";
	str = "get " + attrKey + "():" + attrType + "\n";
	str += "\t" + "{";
	str += "\t" + "\t" + "\t" + "\n";
	str += "\t" + "\t" + "return this.d[\"" + attrKey + "\"];";
	str += "\t" + "\t" + "\t" + "\n";
	str += "\t" + "}" + "\n";
	return str;
}

function creatBaseConfig(className) {
	var str = "";
	str += "class " + className + "\n"; //类名
	str += "{" + "\n";
	str += "\t" + "public key: string;" + "\n";
	str += "\t" + "constructor(element)" + "\n";
	str += "\t" + "{";
	str += "\t" + "\t" + "\t" + "\n";
	str += "\t" + "\t" + "for(var key in element)" + "\n";
	str += "\t" + "\t" + "{" + "\n";
	str += "\t" + "\t" + "\t" + "if (!this.key)" + "\n";
	str += "\t" + "\t" + "\t" + "{" + "\n";
	str += "\t" + "\t" + "\t" + "\t" + "this.key = key;" + "\n";
	str += "\t" + "\t" + "\t" + "}" + "\n";
	str += "\t" + "\t" + "\t" + "this[key] = element[key];" + "\n";
	str += "\t" + "\t" + "}" + "\n";
	str += "\t" + "}" + "\n";
	str += "}" + "\n";
	return str;
}

//生成baseconfig key组
function creatCfgKeyObject(className, fileNameList) {
	var str = "module qmr\n{\n";
	str += "\texport class " + className + "\n"; //类名
	str += "\t{" + "\n";
	fileNameList.forEach((element, index) => {
		str += "\t\t" + "/**" + cfgDesc[index] + "*/" + "\n";
		var index = element.indexOf("-");
		if (index != -1) {
			element = element.slice(0, index);
		}
		var jsonName = element.charAt(0).toLocaleUpperCase() + element.slice(1, element.length);//首字母大写
		str += "\t\t" + "static " + jsonName + ":boolean = true;" + "\n";
	});
	str += "\t}" + "\n}";
	return str;
}

//生成配置枚举
function creatCfgEnum(className, fileNameList) {
	var str = "module qmr\n{\n";
	str += "\texport class " + className + "\n"; //类名
	str += "\t{" + "\n";
	fileNameList.forEach((element, index) => {
		str += "\t\t" + "/**" + cfgDesc[index] + "*/" + "\n";
		var index = element.indexOf("-");
		if (index != -1) {
			element = element.slice(0, index);
		}
		var jsonName = element.charAt(0).toLocaleUpperCase() + element.slice(1, element.length);//首字母大写
		str += "\t\t" + "static " + element.toLocaleUpperCase() + ":string=" + "'" + jsonName + "'" + ";" + "\n";
	});
	str += "\t}" + "\n}";
	return str;
}

//转换属性类型
function changeAttrType(type) {
	type = trim(type);
	type = type.toLocaleLowerCase();//类型转为小写
	if (type == "int") return "number";
	else if (type == "long") return "number";
	else if (type == "array") return "string[]";
	return type;
}

//保存ts文件
function savetsFile(sheetName, jsonStr) {
	if(!tsBean || tsBean == ""){
		console.log("tsDir is null, need not generate ts!");
		return;
	}

	if (!fs.existsSync(tsBean))//文件夹不存在
	{
		//创建该文件夹
		fs.mkdirSync(tsBean);
	}

	var path = tsBean + '/' + sheetName + '.ts';
	if (sheetName == "BaseBean") {
		if (fs.existsSync(path)) {
			console.log("BaseBean存在,不重复生成");
			return;
		}
	}
	fs.writeFile(path, jsonStr, {
		flag: 'w'
	}, function (err) {
		if (err) {
			console.error(err);
		}
	});
}

//删除一个文件下的文件
function deleteFolder(path, fun) {
	var files = [];
	if (fs.existsSync(path)) {
		files = fs.readdirSync(path);
		files.forEach(function (file, index) {
			var curPath = path + "/" + file;
			fs.unlinkSync(curPath);
		});
	}
	fun && fun();
}

//挂到window上   
function setHookWindow(className) {
	var str = 'window["@"] = qmr.@';
	var globalre = /@/g;
	str = str.replace(globalre, className);
	return str;
}
