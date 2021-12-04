
#Requirements:

- node 14+
- npm


# Installation

npm install

node concave.js


# Config File Structure


  ## chain:
    
each chain requires the following fields to be set

name: chain name
endpoint: rpc url
step: how many blocks worth of data to request per call made to RPCs. 
- Applicable for things that grab historical data
- higher value -> faster runtime. May cause timeouts though

###tokens:

A list of forks to pull data for.

## Each 'token' (fork) should have the following fields set:

### tokenAddress
address of the token contract

### stakeTokenAddress
address of the staked token contract

### stakingAddress
address of the contract that holds staked tokens

### startBlock
block to start from when pulling historical data
### endBlock
block to end pulling historical data from

### Abi Fields
ABI json from the corresponding contract. Can get this from the block explorer

### initialSupply
used for calculations

### initialIndex
used for calculations. Necessary because some forks' index did not start at 1.

### bonds
list of bond name/addresses for pulling bond data

    - requires a name and contract address



