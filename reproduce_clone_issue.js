const axios = require('axios');

async function testClone() {
  const url = 'http://localhost:3333/api/repo/clone';
  try {
    const response = await axios.post(url, {
      remoteUrl: 'https://github.com/git/git.git',
      localPath: './tmp-clone-test'
    });
    console.log('Success:', response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.status : error.message);
    if (error.response) {
      console.error('Data:', error.response.data);
    }
  }
}

testClone();
