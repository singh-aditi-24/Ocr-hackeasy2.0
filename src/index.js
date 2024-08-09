require('dotenv').config();
const axios = require('axios');
const pool = require('./db');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

const apiKey = process.env.OPENAI_API_KEY

// Set up storage for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Middleware to serve static files
app.use(express.static('public'));

// Route to serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to handle image upload
app.post('/upload', upload.single('image'), (req, res) => {
  const searchQuery = req.body.searchQuery;
  const imagePath = req.file.path;

  // Log the search query and image path
  console.log('Search Query:', searchQuery);
  console.log('Image Path:', imagePath);

  // Read the image file
  fs.readFile(imagePath, (err, data) => {
      if (err) {
          return res.status(500).json({ error: 'Error reading the image' });
      }

      // res.json({ message: 'Image uploaded successfully', searchQuery, imagePath });
  });

  const convertImageToBase64URL = (filename, imageType = 'png') => {
    try {
      const buffer = fs.readFileSync(filename);
      const base64String = Buffer.from(buffer).toString('base64');
      return `data:image/${imageType};base64,${base64String}`;
    } catch (error) {
      throw new Error(`file ${filename} no exist ❌`)
    }
  }  
  var imageAsBase64 = convertImageToBase64URL(imagePath, 'jpeg')

    const payload = {
      messages: [
          {
              role: 'system',
              content: "You are a smart Quality Keyword Reading Pharma Analyst who has to read and analyze product names from images."
          },
          {
              role: 'user',
              content: [
                  {
                      type: 'image_url',
                      image_url: {
                          url: imageAsBase64
                      }
                  },
                  {
                      type: "text",
                      text: `Your job is to generate a list of keywords by looking at the product names from the image uploaded by the customer.
                             This data is for the Medicine Name, and we need to generate a list based on the product names.
  
                             Remember:
                             1. Provide the keyword name directly as the answer without any preamble.
                             2. The keyword should match the correct product name. For example, if "Paracetamal" is written, the final keyword should be "Paracetamol."
                             3. Do not add any names other than those provided in the image.
                             4. Skip any keyword that is not readable.
                             5. Do not add "50-50" or any dosage information in the Medicine Name.`
                  }
              ]
          }
      ],
      temperature: 1,
      top_p: 1,
      max_tokens: 1024
    };
   
    axios.post(
      'https://openai-ds-pe.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-02-15-preview',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        }
      }
    )
    .then(response => {
      console.log('Response:', JSON.stringify(response.data));
      const content = response.data.choices[0].message.content;
      const contentArray = content.split('\n').map(item => item.trim()).filter(item => item);

      // Logging the array
      console.log('Content Array:', contentArray);
      const promises = contentArray.map((item) => {
        const result = fetchAndStoreData(item);
        return result;
      })
      Promise.all(promises)
      .then((results) => {
        const objectArray = results.map(it => ({ name: it.data?.mdmName, mrp: it.data?.mrp }));
        res.json({ objectArray });
      })
    })
    .catch(error => {
      console.error('Error:', error.response ? error.response.data : error.message);
    });
});



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

async function fetchAndStoreData(searchParam) {
  try {
    // Hit the external API
    const response = axios.get(`https://stark.internal.healthiviti.com/xnLite?name=${searchParam}.`);
    // const data = response.data;

    // Print the response
    // console.log('API Response:', data.mdmName);
    return response;

    // Insert the data into the PostgreSQL database
    // const client = await pool.connect();
    // try {
    //   await client.query('BEGIN');
    //   const insertQuery = 'INSERT INTO distributor_mdm_product_mapping(column1, column2) VALUES($1, $2)';
    //   const values = [data.field1, data.field2]; // Adjust based on your API response structure
    //   await client.query(insertQuery, values);
    //   await client.query('COMMIT');
    // } catch (error) {
    //   await client.query('ROLLBACK');
    //   throw error;
    // } finally {
    //   client.release();
    // }
  } catch (error) {
    console.error('Error fetching or storing data:', error);
  }
}

