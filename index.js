require("dotenv").config();
const axios = require("axios");
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 4000;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB"));

// Define a schema and model for the database
const dataSchema = new mongoose.Schema({
  totalStaked: String,
  escrowVesting: String,
  timestamp: { type: Date, default: Date.now },
});
const Data = mongoose.model("Data", dataSchema);

// Middleware to parse JSON bodies
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Fetch data from external APIs and save to MongoDB
const fetchDataAndSave = async () => {
  const optimisticAPI = `https://api-optimistic.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${process.env.CONTRACT_ADDRESS}&tag=latest&apikey=${process.env.OPTIMISTIC_API_KEY}`;
  const totalStakedURL = `${optimisticAPI}&address=${process.env.STAKED_ADDRESS}`;
  const escrowVestingURL = `${optimisticAPI}&address=${process.env.ESCROW_ADDRESS}`;

  try {
    const resTotalStaked = await axios.get(totalStakedURL);
    const resEscrowVesting = await axios.get(escrowVestingURL);

    const formattedData = {
      totalStaked: resTotalStaked.data?.result,
      escrowVesting: resEscrowVesting.data?.result,
    };

    let existingData = await Data.findOne();
    if (!existingData) {
      existingData = new Data(formattedData);
    } else {
      existingData.totalStaked = formattedData.totalStaked;
      existingData.escrowVesting = formattedData.escrowVesting;
      existingData.timestamp = Date.now();
    }

    await existingData.save();
    console.log("Data updated in MongoDB:", existingData);
  } catch (error) {
    console.error("Error fetching and saving data:", error);
  }
};

// Route to handle GET requests to fetch all data
app.get("/api/staking", async (req, res) => {
  try {
    const response = await Data.find();
    const data = {
      totalStaked: response[0]?.totalStaked,
      escrowVesting: response[0]?.escrowVesting,
    };

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  // Fetch data and save every 4 hours
  setInterval(fetchDataAndSave, 4 * 60 * 60 * 1000);
  console.log(`Server is running on port ${PORT}`);
});
