import { create } from "lodash";

class DidStorage {

    async create(req, res) {
        const did = req.params.did

        return res.status(200).send({
            status: "success-create",
            data: {
                "did": did
            }
        });
    }
    
    async update(req, res) {
        const did = req.params.did

        return res.status(200).send({
            status: "success-update",
            data: {
                "did": did
            }
        });
    }

    async delete(req, res) {
        const did = req.params.did

        return res.status(200).send({
            status: "success-delete",
            data: {
                "did": did
            }
        });
    }

    async get(req, res) {
        const did = req.params.did

        return res.status(200).send({
            status: "success-get",
            data: {
                "did": did
            }
        });
    }

    async migrate(req, res) {
        const did = req.params.did

        return res.status(200).send({
            status: "success-migrate",
            data: {
                "did": did
            }
        });
    }

}

const didStorage = new DidStorage();
export default didStorage;