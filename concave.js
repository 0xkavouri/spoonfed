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
	return Promise.all(data.map(async (log) => {
        let index = log.returnValues.index / 1E9;
        let rebasePercent = log.returnValues.rebase / 1E18;
		let supply = await getSupplyAtBlock(log.blockNumber, context.tokenContract);
        let stakedAmount = await getStakedAmount(log.blockNumber, context.tokenContract, context.stakingAddress);
        supply = supply / 1E9;
        let growth = 1 + ((supply - context.initialSupply) / context.initialSupply);
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
	})).then((parsed) => parsed.filter((val) => val.supply > context.initialSupply && val.index > context.initialIndex))
       .then(filtered => { 
            if (filtered.length > 0) {
                writeToCsv(filtered, `${OUTPUT_DIR}/${context.name}.csv`);
            }
       });

}

let getData = async (context, startBlock, endBlock) => { 
    if (!startBlock) {
        startBlock = context.startBlock;
        endBlock = context.endBlock;
    }

    if (startBlock > endBlock) return;
    let data = await context.stakeTokenContract.getPastEvents('LogRebase', {
        fromBlock: startBlock, 
        toBlock: Math.min(endBlock, startBlock + context.step) 
    }) 


    return process(context, data).then(() => getData(context, startBlock + context.step, endBlock));
}

let getBondData = async (context, bond) => {
    if (!bond) return;
    console.log(context.name, bond.name);

    let startBlock = context.startBlock;
    let endBlock = context.endBlock;
    let results = [];
    let promises = [];
    let bondContract = bond.contract;

    while (startBlock < endBlock) {
       promises.push(bondContract.getPastEvents('ControlVariableAdjustment', {
           fromBlock: startBlock, 
           toBlock: Math.min(startBlock + context.step, endBlock) 
       })
       .then(data => data.filter((res) => !!res))
       .then(data => data.forEach(async (res) => 
            results.push({
                "block": res.blockNumber,
                "bcv": res.returnValues.newBCV, 
                "timestamp": (await context.web3.eth.getBlock(res.blockNumber)).timestamp
            }))));
        startBlock += context.step;
    }

    return Promise.all(promises)
            .then(() => results.sort((a,b) => parseInt(a.block) - parseInt(b.block)))
            .then(data => { writeBondToCsv(data, context.name, bond.name); return data;}); 
}

let writeBondToCsv = (rows, token, name) => {
	const csvWriter = createObjectCsvWriter.createObjectCsvWriter({
		'path': `${OUTPUT_DIR}/${token}_${name}_bond.csv`,
		'header':  [
            {'id': 'block', 'title': 'block'},
            {'id': 'bcv', 'title': 'bcv'},
            {'id': 'timestamp', "title": 'timestamp'},
        ]
	});

	csvWriter.writeRecords(rows);
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
    config.chains.forEach(async (chain) => {
        if (chain.skip) return;
        let web3 = new Web3(chain.endpoint, options);
        Contract.setProvider(web3);

        let contexts = chain.tokens.map((token) => {
            let stakedAbi = JSON.parse(fs.readFileSync(`${config.abiDir}/${token.stakedTokenAbi}`, 'utf8'));
            let stakingAbi = JSON.parse(fs.readFileSync(`${config.abiDir}/${token.stakingAbi}`, 'utf8'));
            let tokenAbi = JSON.parse(fs.readFileSync(`${config.abiDir}/${token.tokenAbi}`, 'utf8'));
            let stakeTokenContract = new Contract(stakedAbi, token.stakeTokenAddress);
            let tokenContract = new Contract(tokenAbi, token.tokenAddress);
            let stakingContract = new Contract(stakingAbi, token.stakingAddress);

            let bondAbi;
            let bondContract;

            let bonds = [];
            if (token.bonds) {
                bondAbi = JSON.parse(fs.readFileSync(`${config.abiDir}/${token.bondAbi}`, 'utf8'));
                token.bonds.forEach(bond => {
                    bondContract = new Contract(bondAbi, bond.address);
                    bonds.push({'name': bond.name, 'contract': bondContract});
                }); 
            }

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
                bondContract: bondContract,
                initialIndex: token.initialIndex,
                bonds: bonds
            };

            return context;
        });

        for (let i = 0; i < contexts.length; i++) {
            console.log('Fetching data for ' + contexts[i].name);
            let context = contexts[i];
            let bonds = context.bonds;
            let bondPromises = bonds.map(bond => getBondData(context, bond));
            let bondData = await Promise.all(bondPromises);
            let data = await getData(context);
        }
    })

}

main();
