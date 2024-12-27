import nodeMailer from 'nodemailer';

export const sendEmail = async({email, subject, message})=>{
     // Ensure message is a string (not a promise)
    if (message instanceof Promise) {
        message = await message;
    }

    const transporter = nodeMailer.createTransport({
        host: process.env.SMTP_HOST,
        service: process.env.SMTP_SERVICE,
        port: process.env.SMTP_PORT,
        auth: {
            user: process.env.SMTP_MAIL,
            pass: process.env.SMTP_PASSWORD,
        },
    });

    const options = {
        from: process.env.SMTP_MAIL,
        to: email,
        subject,
        html: message,
    };

    try {
        // Send email
        await transporter.sendMail(options);
        console.log(`Email sent to ${email}`);
    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error("Failed to send email");
    }

}

