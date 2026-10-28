import axios from 'axios';

const PINATA_API_URL = 'https://api.pinata.cloud/pinning/pinList';
const PINATA_GATEWAY_URL = 'https://gateway.pinata.cloud/ipfs/';
const PINATA_API_KEY = 'your_pinata_api_key'; // Replace with your Pinata API key
const PINATA_SECRET_API_KEY = 'your_pinata_secret_api_key'; // Replace with your Pinata Secret API key

const fetchMetadataFromIpfs = async (cid) => {
    try {
        const response = await axios.get(`${PINATA_GATEWAY_URL}${cid}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching metadata from IPFS:', error);
        throw new Error('Failed to fetch metadata from IPFS');
    }
};

const queryPinataForCid = async (cid) => {
    try {
        const response = await axios.get(PINATA_API_URL, {
            headers: {
                pinata_api_key: PINATA_API_KEY,
                pinata_secret_api_key: PINATA_SECRET_API_KEY,
            },
            params: {
                status: 'pinned',
                cid: cid,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error querying Pinata for CID:', error);
        throw new Error('Failed to query Pinata for CID');
    }
};

export { fetchMetadataFromIpfs, queryPinataForCid };