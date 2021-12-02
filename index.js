import createObjectCsvWriter from 'csv-writer';
import Contract from 'web3-eth-contract';
import Web3 from 'web3';
import fs from 'fs';
import {BN} from 'web3-utils';
import AWSWebsocketProvider from "./aws-websocket-provider.js";

let stakedAbi = JSON.parse(fs.readFileSync('./memo.json', 'utf8'));
let tokenAbi = JSON.parse(fs.readFileSync('./time.json', 'utf8'));
let endpoint = "https://api.avax.network/ext/bc/C/rpc"
var options = {
    timeout: 3000000, // ms

    clientConfig: {
      // Useful if requests are large
      maxReceivedFrameSize: 100000000,   // bytes - default: 1MiB
      maxReceivedMessageSize: 100000000, // bytes - default: 8MiB

      // Useful to keep a connection alive
      keepalive: true,
      keepaliveInterval: 60000 // ms
    },

    // Enable auto reconnection
    reconnect: {
        auto: true,
        delay: 5000, // ms
        maxAttempts: 5,
        onTimeout: false
    }
};

let stakedAddress = '0x136acd46c134e8269052c62a67042d6bdedde3c9';
let ohmToken = '0xb54f16fb19478766a268f172c9480f8da1a7c9c3';
const web3 = new Web3(endpoint, options);
Contract.setProvider(web3);
let stakedContract = new Contract(stakedAbi, stakedAddress);
let tokenContract = new Contract(tokenAbi, ohmToken);
let process = async (err, data, cb) => {
	let parsed = await Promise.all(data.map(async (log) => {
		let supply = await getSupplyAtBlock(log.blockNumber);
		return {
			'blockNumber': log.blockNumber,
			'index': log.returnValues.index / 1E9,
            'supply': supply / 1E9 
		};
	}))

    if (parsed.length == 0) return;

	writeToCsv(parsed, 'time.csv');
}

let getData = async (startBlock, endBlock) => { 
    if (endBlock <= startBlock) return;
    let res = await stakedContract.getPastEvents('LogRebase', {
        fromBlock: startBlock, 
        toBlock: Math.min(endBlock, startBlock + 1E5) 
        };

    process(res)
    getData(startBlock + 1E5, endBlock)))
}


let writeToCsv = (rows, name) => {
	const csvWriter = createObjectCsvWriter.createObjectCsvWriter({
		'path': name,
		'header':  [{'id': 'blockNumber', 'title': 'blockNumber'}, {'id': 'index', 'title': 'index'}, {'id': 'supply', "title": 'supply'}],
        'append': true
	});

	csvWriter.writeRecords(rows);
}

let getSupplyAtBlock = (block) => {

	return tokenContract.methods.totalSupply().call(undefined, block)
}


// should update this to fetch latest block
getData(3770000, 7690892);
