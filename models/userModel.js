import mongoose from 'mongoose'
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto' // by default present in node js

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: {
        type: String,
        minLength:[8, "Password must have atleast 8 characters."],
        maxLength:[32, "Password must have maximum 20 characters."],
        select:false,
    },
    phone: String,
    accountVerified:{
        type: Boolean,
        default: false
    },
    verificationCode:{
        type: Number
    },
    verificationCodeExpire:{
        type: Date
    },
    resetPasswordToken:{
        type:String
    },
    resetPasswordExpire:{
        type:Date
    },
    createdAt:{
        type:Date,
        default:Date.now
    }
});

userSchema.pre('Save', async function(next){
    if(!this.isModified('password')){
        next();
    }
     // Hash the password
     try {
        const hashedPassword = bcrypt.hash(this.password, 10);
        this.password = hashedPassword;  // Save the hashed password
        next();  // Proceed to the next middleware
    } catch (error) {
        next(error);  // Pass any errors to the next middleware
    }
});

userSchema.methods.comparePassword = async function(enteredPassword){
    return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.generateVerificationCode = function(){
    function generateRandomFiveDigitNumber(){
        const firstDigit = Math.floor(Math.random() * 9) + 1;  // decimal vale multiply by 9
        const remainingDigits = Math.floor(Math.random() * 10000).toString(). padStart(4, 0);

        return parseInt(firstDigit + remainingDigits);
    }

    const verificationCode = generateRandomFiveDigitNumber();
    this.verificationCode = verificationCode;
    this.verificationCodeExpire = Date.now() + 10 * 60 * 1000 // expire after 10 minutes

    return verificationCode;
}


userSchema.methods.generateToken = async function(){
    return jwt.sign({id: this._id}, process.env.JWT_SECRET_KEY, {
        expiresIn: process.env.JWT_EXPIRE
    })
}


userSchema.methods.generateResetPasswordToken = function(){
    const resetToken = crypto.randomBytes(20).toString("hex");
    this.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    this.resetPasswordExpire = Date.now() + 15*60*1000;

    return resetToken;
}



export const User = mongoose.model("User", userSchema);