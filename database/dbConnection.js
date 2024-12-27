import mongoose from "mongoose";

export const connection = () =>{
    mongoose.connect(process.env.MONGO_URI, {
        dbName: "MERN_AUTHENTICATION"
    }).then(()=>{
        console.log("Connected to DB");
    }).catch((err) =>{
        console.log("Error connecting to MongoDB");
    })
}