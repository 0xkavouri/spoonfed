
# Requirements:

- node 14+
- npm
- a directory named 'data' in the directory where you run the code


# Installation & Running

```bash
docker-compose build spoonfed
```

```bash
docker-compose up spoonfed
```

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
list of bond name/addresses for pulling bond data.
requires a name and contract address



# Example config for a new fork

add this under the chain that the fork is on.

             name: "fooooork"
              tokenAddress: '<address>'
              stakeTokenAddress: '<address>'
              stakingAddress: '<address>'
              bonds: 
                -   
                  name: 'bar'
                  address: '<address of bond contract>'
                -   
                  name: 'foo'
                  address: <address as a string>
              startBlock: <number> 
              endBlock: <number>
              tokenAbi: "<path to json file w/ abi>"
              stakedTokenAbi: "<path to json file w/ abi>"
              stakingAbi: "<path to json file w/ abi>"
              bondAbi: "<path to json file w/ abi>"
              initialSupply: <number>
              initialIndex: <number>

# Todo
- [ ] Get more metrics added to the list
  - [X] Index
  - [X] Supply
  - [X] Growth
  - [X] Dilution
  - [X] StakedAmount
  - [X] Rebase
  - [X] APY
  - [ ] ..
- [ ] Fix $TIME
  - [ ] APY
  - [ ] Index
- [ ] Add BONDS for chains
