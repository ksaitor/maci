import {
    User,
} from '../'

import {
    StateLeaf,
} from 'maci-domainobjs'

import {
    bigInt,
    IncrementalMerkleTree,
} from 'maci-crypto'

describe('User', () => {

    it('A blankUser should match a blank state leaf', () => {
        const depth = 4
        const tree = new IncrementalMerkleTree(4, bigInt(0))
        const user = User.genBlankUser(4)
        const stateLeaf = StateLeaf.genBlankLeaf(tree.root)
        expect(stateLeaf.hash().toString()).toEqual(user.genStateLeaf(depth).hash().toString())
    })
})
