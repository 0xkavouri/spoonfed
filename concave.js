import createObjectCsvWriter from 'csv-writer';
import Contract from 'web3-eth-contract';
import Web3 from 'web3';
import fs from 'fs';
import {BN} from 'web3-utils';
import YAML from 'yaml';

let ABI_DIR;
let OUTPUT_DIR;
let config;

// mapping of fork name => object containing info needed to pull data for a particular fork 
let contexts = {};

let parseConfig = () => {
    config = YAML.parse(fs.readFileSync('./config.yaml', 'utf8'));
    ABI_DIR = config.abiDir;
    OUTPUT_DIR = config.outputDir;
}

// global options object. Not really needed
var options = {
    timeout: 30000, // ms

    clientConfig: {
      maxReceivedFrameSize: 100000000,   // bytes - default: 1MiB
      maxReceivedMessageSize: 100000000, // bytes - default: 8MiB

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

let process = async (context, data) => {
	let parsed = await Promise.all(data.map(async (log) => {
        let index = log.returnValues.index / 1E9;
        let rebasePercent = log.returnValues.rebase / 1E18;
		let supply = await getSupplyAtBlock(log.blockNumber, context.tokenContract);
        let stakedAmount = await getStakedAmount(log.blockNumber, context.tokenContract, context.stakingAddress);
        supply = supply / 1E9;
        let growth = 1 + ((supply - context.initialSupply) / context.initialSupply);
        if (context.name == 'spartacus')
            console.log(supply, index);
		return {
			'blockNumber': log.blockNumber,
			'index': index,
            'supply': supply, 
            'growth': 1 + ((supply - context.initialSupply) / context.initialSupply),
            'dilution': 1 - ((index / context.initialIndex) / growth), 
            'stakedAmount': stakedAmount / 1E9, 
            'rebase': rebasePercent,
            'apy': 100 * ((1 + rebasePercent) ** 1095)
		};
	}))

    parsed = parsed.filter((val) => val.supply > context.initialSupply && val.index > context.initialIndex);
    if (parsed.length == 0) return;

	writeToCsv(parsed, `${OUTPUT_DIR}/${context.name}.csv`);
}

let getData = async (context, startBlock, endBlock) => { 
    if (!startBlock) {
        startBlock = context.startBlock;
        endBlock = context.endBlock;
    }

    if (startBlock > endBlock) return;
    let data = await context.stakeTokenContract.getPastEvents('LogRebase', {
        fromBlock: startBlock, 
        toBlock: Math.min(endBlock, startBlock + 1E5) 
    }) 


    process(context, data);
    getData(context, startBlock + context.step, endBlock);
}


let writeToCsv = (rows, name) => {
	const csvWriter = createObjectCsvWriter.createObjectCsvWriter({
		'path': name,
		'header':  [
            {'id': 'blockNumber', 'title': 'blockNumber'},
            {'id': 'index', 'title': 'index'},
            {'id': 'supply', "title": 'supply'},
            {'id': 'growth', "title": 'growth'},
            {'id': 'dilution', "title": 'dilution'},
            {'id': 'stakedAmount', "title": 'stakedAmount'},
            {'id': 'rebase', "title": 'rebase'},
            {'id': 'apy', "title": 'apy'}
        ],
        'append': true
	});

	csvWriter.writeRecords(rows);
}

let getSupplyAtBlock = async (block, tokenContract) => {
	return tokenContract.methods.totalSupply().call(undefined, block)
}

let getStakedAmount = async (block, tokenContract, stakingContract) => {
    return tokenContract.methods.balanceOf(stakingContract).call(undefined, block);
}


let main = () => {
    parseConfig();
    config.chains.forEach((chain) => {
        if (chain.skip) return;
        let web3 = new Web3(chain.endpoint, options);
        Contract.setProvider(web3);

        chain.tokens.forEach(async (token) => {
            let stakedAbi = JSON.parse(fs.readFileSync(config.abiDir + token.stakedTokenAbi, 'utf8'));
            let stakingAbi = JSON.parse(fs.readFileSync('./' + token.stakingAbi, 'utf8'));
            let tokenAbi = JSON.parse(fs.readFileSync('./' + token.tokenAbi, 'utf8'));
            let stakeTokenContract = new Contract(stakedAbi, token.stakeTokenAddress);
            let tokenContract = new Contract(tokenAbi, token.tokenAddress);
            let stakingContract = new Contract(stakingAbi, token.stakingAddress);
            let context = {
                name: token.name,
                web3: web3,
                endpoint: chain.endpoint,
                step: chain.step,
                startBlock: token.startBlock,
                endBlock: token.endBlock,
                tokenContract: tokenContract,
                stakeTokenContract: stakeTokenContract,
                initialSupply: token.initialSupply,
                stakingContract: stakingContract,
                stakingAddress: token.stakingAddress,
                initialIndex: token.initialIndex
            };

            getData(context);
        });
    })

}

main();
