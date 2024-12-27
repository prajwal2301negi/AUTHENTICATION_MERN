import ErrorHandler from '../middlewares/error.js';
import { catchAsyncError } from '../middlewares/catchAsyncError.js';
import { User } from '../models/userModel.js';
import { sendEmail } from '../utils/sendEmail.js';

import twilio from 'twilio';
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

import { sendToken } from '../utils/sendToken.js';

import crypto from 'crypto';


export const register = catchAsyncError(async (req, res, next) => {
    try {
        const { name, email, password, phone, verificationMethod } = req.body;
        if (!name || !email || !password || !phone || !verificationMethod) {
            return next(new ErrorHandler("All fields are required, 400"));
        }
        function validatePhoneNumber(phone) {
            // validating phone number using regex
            const phoneRegex = /^(\+91[\-\s]?)?[0]?[6789]\d{9}$/;
            return phoneRegex.test(phone); // for Indian Numbers
        }
        if (!validatePhoneNumber(phone)) {
            return next(new ErrorHandler("Invalid phone number", 400));
        }

        const existingUser = await User.findOne({
            $or: [
                {
                    email,
                    accountVerified: true,
                },
                {
                    phone,
                    accountVerified: true
                }
            ]
        });

        if (existingUser) {
            return next(new ErrorHandler("Phone or email already exists", 400));
        }


        // Allowing 3 attempts for user for verification
        const registerationAttemptByUser = await User.find({
            $or: [
                {
                    phone, accountVerified: false
                },
                {
                    email, accountVerified: false
                }

            ],
        });
        if (registerationAttemptByUser.length > 3) {
            return next(new ErrorHandler("You have exceeded the maximum number of registration attempts", 400));
        }

        const userData = {
            name, email, phone, password
        };

        const user = await User.create(userData);

        const verificationCode = await user.generateVerificationCode();

        await user.save();

        // send user verification code
        sendVerificationCode(verificationMethod, verificationCode, email, phone, res);

    }
    catch (error) {
        next(error)
    }
});



async function sendVerificationCode(verificationMethod, verificationCode, email, phone, res) {
    if (verificationMethod === "email") {
        try {
            const message = generateEmailTemplate(verificationCode);
            await sendEmail({ email, subject: "Your Verification Code", message });

            // Respond with success if email is sent
            res.status(200).json({
                success: true,
                message: "Verification code sent to your email",
            });
        } catch (error) {
            console.error('Error sending verification code via email:', error);

            // Send failure response but don't crash the server
            res.status(500).json({
                success: false,
                message: "Error sending verification code via email",
            });
        }
    }
    else if (verificationMethod === "phone") {
        // console.log('Twilio SID:', process.env.TWILIO_ACCOUNT_SID);
        // console.log('Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN);
        // console.log('Twilio Phone Number:', process.env.TWILIO_PHONE_NUMBER);

        const verificationCodeWithSpace = verificationCode.toString().split("").join(" ");


        try {
            // Ensure that both 'from' and 'to' phone numbers are valid
            if (!process.env.TWILIO_PHONE_NUMBER || !phone) {
                throw new Error("Invalid phone numbers");
            }

            const call = await client.calls.create({
                twiml: `<Response><Say>Your verification code is ${verificationCodeWithSpace}. Your verification code is ${verificationCodeWithSpace}.</Say></Response>`,
                from: process.env.TWILIO_PHONE_NUMBER, // Twilio phone number
                to: phone, // Recipient phone number
            });

            // Respond with success if the call is initiated
            res.status(200).json({
                success: true,
                message: "Verification code sent to your phone",
            });

            console.log('Call initiated:', call.sid);
        } catch (error) {
            console.error('Error sending verification code via phone:', error);

            // Check for more specific error messages
            if (error.code === 21212) {
                console.error("Error 21212: Invalid 'from' number or 'to' number");
            }

            // Send failure response but don't crash the server
            res.status(500).json({
                success: false,
                message: "Error sending verification code via phone",
            });
        }
    }
    else {
        // Handle invalid verification method
        res.status(400).json({
            success: false,
            message: "Invalid verification method provided",
        });
    }
}



async function generateEmailTemplate(verificationCode) {
    return `
        <div >
            <div >Your Verification Code</div>
            <p>Hi [Recipient's Name],</p>
            <p>Thank you for signing up with <strong>[Your Company Name]</strong>!</p>
            <p>Your verification code is:</p>
            <div >${verificationCode}</div>
            <p>Please enter this code on the verification screen to complete your setup.</p>
            <p>If you did not request this code, you can safely ignore this email.
            <p>Thank you,<br>The [Your Company Name] Team</p>
            <div >
                If you have any questions, visit our <a href="https://www.yourcompany.com/help">Help Center</a>.
            </div>
        </div>
    `;
}

export const verifyOTP = catchAsyncError(async (req, res, next) => {
    const { email, otp, phone } = req.body;

    function validatePhoneNumber(phone) {
        const phoneRegex = /^(\+91[\-\s]?)?[0]?[6789]\d{9}$/;
        return phoneRegex.test(phone);
    }
    if (!validatePhoneNumber(phone)) {
        return next(new ErrorHandler("Invalid phone number.", 400));
    }

    try {
        // getting latest entry of user
        const userAllEntries = await User.find({
            $or: [
                {
                    email,
                    accountVerified: false,
                },
                {
                    phone,
                    accountVerified: false,
                },
            ],
        }).sort({
            createdAt: -1, // descending order -> last entry at the top.
        });

        if (!userAllEntries || userAllEntries.length === 0) {
            console.log('No matching user found for email:', email, 'or phone:', phone);
            return next(new ErrorHandler("User not found.", 404));
        }

        let user;
        if (userAllEntries.length > 1) {
            // removing old entries and keeping latest entry
            user = userAllEntries[0];

            await User.deleteMany({
                _id: { $ne: user._id },
                $or: [
                    { phone, accountVerified: false },
                    { email, accountVerified: false },
                ],
            });
        } else {
            user = userAllEntries[0];
            // If single entry is present.
        }
        if (!user) {
            return next(new ErrorHandler("User not found.", 404));
        }

        if (user.verificationCode === undefined || user.verificationCode !== Number(otp)) {
            return next(new ErrorHandler('Invalid OTP', 400));
        }

        const currentTime = Date.now();
        const verificationCodeExpire = new Date(user.verificationCodeExpire);

        if (isNaN(verificationCodeExpire.getTime())) {
            return next(new ErrorHandler('Invalid expiration time', 400));
        }

        if (currentTime > verificationCodeExpire) {
            return next(new ErrorHandler('OTP has expired', 400));
        }

        user.accountVerified = true;
        user.verificationCode = null;
        user.verificationCodeExpire = null;

        await user.save({ validateModifiedOnly: true }); // see validation for the values we modified. eg -> true is the boolean value, cannot be string ie "TRUE".

        sendToken(user, 200, "Account Verified", res);
    }
    catch (error) {
        return next(new ErrorHandler("Internal Server Error", 500));
    }
});


export const login = catchAsyncError(async (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return next(new ErrorHandler('Please provide both email and password', 400));
    }
    const user = await User.findOne({ email, accountVerified: true });
    if (!user) {
        return next(new ErrorHandler('Invalid email or password', 401));
    }
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
        return next(new ErrorHandler('Invalid email or password', 401));
    }
    sendToken(user, 200, "Logged in successfully", res);
});


export const logout = catchAsyncError(async (req, res, next) => {
    res.status(200).cookie("token", "", {
        expires: new Date(Date.now()),
        httpOnly: true
    }).json({
        success: true,
        message: "Logout successfully"
    });
});


export const getUser = catchAsyncError(async (req, res, next) => {
    const user = req.user // fetching from req.user.
    res.status(200).json({
        success: true,
        user
    });
})


// Forgot Password
export const forgotPassword = catchAsyncError(async (req, res, next) => {

    // requirements for forgot password
    const user = await User.findOne({
        email: req.body.email,
        accountVerified: true,
    });

    if (!user) {
        return next(new ErrorHandler('User not found with that email', 404));
    }

    // reset token
    const resetToken = user.generateResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const resetPasswordUrl = `${process.env.FRONTEND_URL}/password/reset/${resetToken}`;

    const message = ` Your Reset Password Token is:- \n\n ${resetPasswordUrl} \n\n If you have not requested email, ignore this.`

    try {
        sendEmail({ email: user.email, subject: "MERN AUTHENTICATION APP RESET PASSWORD", message });
        res.status(200).json({
            success: true,
            message: `Email sent to ${user.email} successfully.`,
        });
    }
    catch (error) {
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire - undefined;
        await user.save({ validateBeforeSave: false });
        return next(new ErrorHandler(error.message ? error.message : "Cannot send reset password token.", 500))
    }
});

export const resetPassword = catchAsyncError(async(req, res, next)=>{
    const {token} = req.params;
    const resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user){
        return next(new ErrorHandler("Reset password token is invalid or has been expired.", 400));
    }
    if(req.body.password !== req.body.confirmPassword){
        return next(new ErrorHandler("Password does not match", 400));
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    sendToken(user, 200, "Reset Password Successfully.", res);
});

