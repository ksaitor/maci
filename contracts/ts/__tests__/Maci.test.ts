require('module-alias/register')
jest.setTimeout(90000)
import { genAccounts, genTestAccounts } from '../accounts'
import { config } from 'maci-config'
import * as etherlime from 'etherlime-lib'
import * as ethers from 'ethers'

import {
    deployMaci,
    deploySignupToken,
    deploySignupTokenGatekeeper,
    genDeployer,
} from '../deploy'

import {
    genKeyPair,
    setupTree,
    NOTHING_UP_MY_SLEEVE,
} from 'maci-crypto'

const accounts = genTestAccounts(5)
const deployer = genDeployer(accounts[0].privateKey)

describe('MACI', () => {
    let maciContract
    let signUpTokenContract
    let signUpTokenGatekeeperContract

    // Set up users
    // TODO: create a domain object for public keys
    const user1 = {
        wallet: accounts[1],
        keypair: genKeyPair(),
    }

    const user2 = {
        wallet: accounts[2],
        keypair: genKeyPair(),
    }

    const badUser = {
        wallet: accounts[3],
        keypair: genKeyPair(),
    }

    beforeAll(async () => {
        signUpTokenContract = await deploySignupToken(deployer)
        signUpTokenGatekeeperContract = await deploySignupTokenGatekeeper(
            deployer,
            signUpTokenContract.contractAddress,
        )
        const contracts = await deployMaci(
            deployer,
            signUpTokenGatekeeperContract.contractAddress,
        )

        maciContract = contracts.maciContract

        const numEth = 0.5
        for (let i = 1; i < accounts.length; i++) {
            const tx = await deployer.provider.sendTransaction(
                accounts[0].sign({
                    nonce: await deployer.provider.getTransactionCount(accounts[0].address),
                    gasPrice: ethers.utils.parseUnits('10', 'gwei'),
                    gasLimit: 21000,
                    to: accounts[i].address,
                    value: ethers.utils.parseUnits('1', 'ether'),
                    data: '0x'
                })
            )
            const receipt = await tx.wait()
            console.log(`Gave away ${numEth} ETH to`, accounts[i].address)
        }

        // give away a signUpToken to each user
        await signUpTokenContract.giveToken(user1.wallet.address)
        await signUpTokenContract.giveToken(user2.wallet.address)
    })

    it('each user should own a token', async () => {
        const ownerOfToken1 = await signUpTokenContract.ownerOf(1)
        expect(ownerOfToken1).toEqual(user1.wallet.address)

        const ownerOfToken2 = await signUpTokenContract.ownerOf(2)
        expect(ownerOfToken2).toEqual(user2.wallet.address)
    })

    it('the emptyVoteOptionTreeRoot value should be correct', async () => {
        const tree = setupTree(
            config.merkleTrees.voteOptionTreeDepth,
            NOTHING_UP_MY_SLEEVE,
        )
        const root = await maciContract.emptyVoteOptionTreeRoot()
        expect(tree.root.toString()).toEqual(root.toString())
    })

    describe('sign-ups', async () => {

        it('a user who does not own a SignUpToken should not be able to sign up', async () => {
            expect.assertions(1)

            const wallet = user1.wallet.connect(deployer.provider as any)
            const contract = new ethers.Contract(
                maciContract.contractAddress,
                maciContract.interface.abi,
                wallet,
            )

            try {
                await contract.signUp(
                    { 
                        x: user1.keypair.pubKey[0].toString(),
                        y: user1.keypair.pubKey[1].toString(),
                    },
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [2]),
                    { gasLimit: 2000000 },
                )
            } catch (e) {
                expect(e.message.endsWith('SignUpTokenGatekeeper: this user does not own the token')).toBeTruthy()
            }
        })

        it('a user owns a SignUpToken should be able to sign up', async () => {
            const wallet = user1.wallet.connect(deployer.provider as any)
            const contract = new ethers.Contract(
                maciContract.contractAddress,
                maciContract.interface.abi,
                wallet,
            )
            const tx = await contract.signUp(
                { 
                    x: user1.keypair.pubKey[0].toString(),
                    y: user1.keypair.pubKey[1].toString(),
                },
                ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                { gasLimit: 2000000 },
            )
            const receipt = await tx.wait()

            expect(receipt.status).toEqual(1)
        })

        it('a user who uses a previously used SignUpToken to sign up should not be able to do so', async () => {
            expect.assertions(5)
            const wallet = user1.wallet.connect(deployer.provider as any)
            const wallet2 = user2.wallet.connect(deployer.provider as any)

            const tokenContract = new ethers.Contract(
                signUpTokenContract.contractAddress,
                signUpTokenContract.interface.abi,
                wallet,
            )

            // Send token 1 from user1 to user2
            let tx = await tokenContract.safeTransferFrom(
                user1.wallet.address,
                user2.wallet.address,
                1,
                { gasLimit: 500000 },
            )

            let receipt = await tx.wait()
            expect(receipt.status).toEqual(1)

            let ownerOfToken1 = await signUpTokenContract.ownerOf(1)
            expect(ownerOfToken1).toEqual(user2.wallet.address)

            // Attempt to sign up with token 1 as user2, which should fail
            try {
                const maciContract2 = new ethers.Contract(
                    maciContract.contractAddress,
                    maciContract.interface.abi,
                    wallet2,
                )
                await maciContract2.signUp(
                    { 
                        x: user2.keypair.pubKey[0].toString(),
                        y: user2.keypair.pubKey[1].toString(),
                    },
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                    { gasLimit: 2000000 },
                )
            } catch (e) {
                console.log(e.message)
                expect(e.message.endsWith('SignUpTokenGatekeeper: this token has already been used to sign up')).toBeTruthy()
            }

            // Send the token back to user1 from user2
            const tokenContract2 = new ethers.Contract(
                signUpTokenContract.contractAddress,
                signUpTokenContract.interface.abi,
                wallet2,
            )

            tx = await tokenContract2.safeTransferFrom(
                user2.wallet.address,
                user1.wallet.address,
                1,
                { gasLimit: 500000 },
            )

            receipt = await tx.wait()
            expect(receipt.status).toEqual(1)

            ownerOfToken1 = await signUpTokenContract.ownerOf(1)
            expect(ownerOfToken1).toEqual(user1.wallet.address)
        })
    })
})