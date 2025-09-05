/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "cadc320223df220f49cd6f1f595f89ff783a79011f9ba439ba2bb8df796f943f6f1e0f6aece00243906b146c564755409045bd13ce5364d15c182e41d7a89839";

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

const uri = process.env.MONGODB_URI || `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.gqjzz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// Enhanced Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = './uploads';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit for files
    }
});

// Separate upload handlers for different file types
const uploadFile = upload.single('file');
const uploadAudio = upload.single('audio');
const uploadProfile = upload.single('profileImage');
const uploadPostMedia = upload.single('media');

// Helper functions
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isStrongPassword = (password) => password.length >= 8;

// Predefined communities
const COMMUNITIES = [
    { name: "Painting", icon: "palette", hobbies: ["Painting"] },
    { name: "Cooking", icon: "utensils", hobbies: ["Cooking"] },
    { name: "Wood Working", icon: "hammer", hobbies: ["Wood Working"] },
    { name: "Photography", icon: "camera", hobbies: ["Photography"] },
    { name: "Calligraphy", icon: "pen-fancy", hobbies: ["Calligraphy"] },
    { name: "Musical Instruments", icon: "music", hobbies: ["Musical Instruments"] },
    { name: "Hiking", icon: "mountain", hobbies: ["Hiking"] },
    { name: "Collecting", icon: "box-open", hobbies: ["Collecting"] },
    { name: "Gaming", icon: "gamepad", hobbies: ["Gaming"] },
    { name: "Pottery", icon: "jar", hobbies: ["Pottery"] },
    { name: "Cycling", icon: "bicycle", hobbies: ["Cycling"] },
    { name: "Blogging", icon: "blog", hobbies: ["Blogging"] },
    { name: "Chess", icon: "chess", hobbies: ["Chess"] },
    { name: "Fitness", icon: "dumbbell", hobbies: ["Fitness"] },
    { name: "Video Editing", icon: "video", hobbies: ["Video editing"] },
    { name: "DIY Crafting", icon: "tools", hobbies: ["DIY crafting"] },
    { name: "Yoga", icon: "spa", hobbies: ["Yoga"] },
    { name: "Gardening", icon: "seedling", hobbies: ["Gardening"] }
];

async function run() {
    try {
        await client.connect();
        console.log("Connected to MongoDB!");

        const db = client.db("homiee");
        const usersCollection = db.collection("users");
        const communitiesCollection = db.collection("communities");
        const chatsCollection = db.collection("chats");

        // Initialize communities if empty
        const existingCount = await communitiesCollection.countDocuments();
        if (existingCount === 0) {
            await communitiesCollection.insertMany(COMMUNITIES);
        }

        // Signup Route
        app.post("/signup", async (req, res) => {
            const { firstName, lastName, userName, email, password, hobbies } = req.body;

            if (!firstName || !lastName || !userName || !email || !password) {
                return res.status(400).json({ error: "All fields are required!" });
            }

            if (!isValidEmail(email)) {
                return res.status(400).json({ error: "Invalid email format!" });
            }

            if (!isStrongPassword(password)) {
                return res.status(400).json({ error: "Password must be at least 8 characters long!" });
            }

            const existingEmail = await usersCollection.findOne({ email });
            if (existingEmail) {
                return res.status(400).json({ error: "Email already exists!" });
            }

            const existingUserName = await usersCollection.findOne({ userName });
            if (existingUserName) {
                return res.status(400).json({ error: "Username already taken!" });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            await usersCollection.insertOne({
                firstName,
                lastName,
                userName,
                email,
                password: hashedPassword,
                hobbies: hobbies || [],
                description: "",
                profileImage: "",
                posts: [],
                communities: []
            });

            res.status(201).json({ message: "Signup successful!" });
        });

        // Login Route
        app.post("/login", async (req, res) => {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: "All fields are required!" });
            }

            const user = await usersCollection.findOne({ email });
            if (!user) {
                return res.status(400).json({ error: "User not found!" });
            }

            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(400).json({ error: "Invalid credentials!" });
            }

            // Get communities that match user's hobbies
            let userCommunities = [];
            if (user.hobbies && user.hobbies.length > 0) {
                userCommunities = await communitiesCollection.find({
                    name: { $in: user.hobbies }
                }).toArray();

                // Update user's communities if not already set
                if (!user.communities || user.communities.length !== userCommunities.length) {
                    await usersCollection.updateOne(
                        { email },
                        { $set: { communities: userCommunities.map(c => c.name) } }
                    );
                }
            }

            const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
            res.json({
                message: "Login successful!",
                token,
                email: user.email,
                userName: user.userName,
                hobbies: user.hobbies,
                communities: userCommunities
            });
        });

        // Get user by email
        app.get("/users/:email", async (req, res) => {
            const { email } = req.params;

            try {
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).json({ error: "User not found" });
                }

                res.json(user);
            } catch (error) {
                console.error("Error fetching user:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // Update user profile and posts
        app.put("/users", (req, res, next) => {
            uploadProfile(req, res, async (err) => {
                if (err instanceof multer.MulterError) {
                    return res.status(400).json({ error: "File upload error" });
                } else if (err) {
                    return res.status(500).json({ error: "Unknown upload error" });
                }

                const { email, description, hobbies, post, postId, like, comment } = req.body;
                const profileImageFile = req.file;

                let profileImage = profileImageFile ? `${req.protocol}://${req.get('host')}/uploads/${profileImageFile.filename}` : undefined;

                if (!email) {
                    if (profileImageFile) fs.unlinkSync(profileImageFile.path);
                    return res.status(400).json({ error: "Email is required." });
                }

                // Handle like updates
                if (postId && typeof like !== 'undefined') {
                    try {
                        const updateOperation = {
                            $inc: { "posts.$[post].likes": like ? 1 : -1 }
                        };
                        const options = {
                            arrayFilters: [{ "post.id": parseInt(postId) }]
                        };

                        const result = await usersCollection.updateOne(
                            { email },
                            updateOperation,
                            options
                        );

                        if (result.modifiedCount === 0) {
                            return res.status(404).json({ error: "Post not found or nothing changed." });
                        }

                        return res.json({ message: "Like updated successfully!" });
                    } catch (error) {
                        console.error("Error updating like:", error);
                        return res.status(500).json({ error: "Internal server error." });
                    }
                }

                // Handle comment additions
                if (postId && comment) {
                    try {
                        const newComment = {
                            id: Date.now(),
                            user: comment.user,
                            text: comment.text,
                            timestamp: new Date().toISOString()
                        };

                        const result = await usersCollection.updateOne(
                            { email, "posts.id": parseInt(postId) },
                            { $push: { "posts.$.comments": newComment } }
                        );

                        if (result.modifiedCount === 0) {
                            return res.status(404).json({ error: "Post not found or nothing changed." });
                        }

                        return res.json({ message: "Comment added successfully!", comment: newComment });
                    } catch (error) {
                        console.error("Error adding comment:", error);
                        return res.status(500).json({ error: "Internal server error." });
                    }
                }

                // Parse the post object if it exists
                let postData = null;
                if (post) {
                    try {
                        postData = JSON.parse(post);
                    } catch (e) {
                        if (profileImageFile) fs.unlinkSync(profileImageFile.path);
                        return res.status(400).json({ error: "Invalid post data format" });
                    }
                }

                // Handle post media upload separately
                if (postData && postData.media) {
                    uploadPostMedia(req, res, async (mediaErr) => {
                        if (mediaErr) {
                            if (profileImageFile) fs.unlinkSync(profileImageFile.path);
                            return res.status(400).json({ error: "Media upload failed" });
                        }

                        const mediaFile = req.file;
                        if (mediaFile) {
                            postData.media = `${req.protocol}://${req.get('host')}/uploads/${mediaFile.filename}`;
                            postData.mediaType = mediaFile.mimetype;
                        }

                        completeUserUpdate();
                    });
                } else {
                    completeUserUpdate();
                }

                async function completeUserUpdate() {
                    const updateFields = {};
                    if (description) updateFields.description = description;
                    if (profileImage) updateFields.profileImage = profileImage;
                    if (hobbies) {
                        updateFields.hobbies = hobbies;
                        // Update communities based on new hobbies
                        const userCommunities = await communitiesCollection.find({
                            name: { $in: hobbies }
                        }).toArray();
                        updateFields.communities = userCommunities.map(c => c.name);
                    }

                    const updateOperation = {};
                    if (postData) {
                        updateOperation.$push = { posts: postData };
                    }
                    if (Object.keys(updateFields).length > 0) {
                        updateOperation.$set = updateFields;
                    }

                    if (Object.keys(updateOperation).length === 0) {
                        if (profileImageFile) fs.unlinkSync(profileImageFile.path);
                        return res.status(400).json({ error: "No valid fields to update." });
                    }

                    try {
                        const result = await usersCollection.updateOne(
                            { email },
                            updateOperation
                        );

                        if (result.modifiedCount === 0) {
                            if (profileImageFile) fs.unlinkSync(profileImageFile.path);
                            return res.status(404).json({ error: "User not found or nothing changed." });
                        }

                        res.json({
                            message: "User updated successfully!",
                            updated: {
                                ...updateFields,
                                postAdded: !!postData,
                                mediaUrl: postData?.media,
                                profileImageUrl: profileImage
                            }
                        });
                    } catch (error) {
                        if (profileImageFile) fs.unlinkSync(profileImageFile.path);
                        console.error("Error updating user:", error);
                        res.status(500).json({ error: "Internal server error." });
                    }
                }
            });
        });

        // Delete post endpoint
        app.delete("/users/:email/posts/:postId", async (req, res) => {
            const { email, postId } = req.params;

            try {
                const result = await usersCollection.updateOne(
                    { email },
                    { $pull: { posts: { id: parseInt(postId) } } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({ error: "Post not found or nothing changed." });
                }

                res.json({ message: "Post deleted successfully!" });
            } catch (error) {
                console.error("Error deleting post:", error);
                res.status(500).json({ error: "Internal server error." });
            }
        });

        // Get post by ID
        // Enhanced: Get post by ID with full user info
        // Fixed: Get full post data including full user info
        app.get("/posts/:postId", async (req, res) => {
            const { postId } = req.params;

            try {
                const user = await usersCollection.findOne({ "posts.id": parseInt(postId) });

                if (!user) {
                    return res.status(404).json({ error: "Post not found (user not found)" });
                }

                const post = user.posts.find(p => p.id === parseInt(postId));
                if (!post) {
                    return res.status(404).json({ error: "Post not found (post not in user's posts)" });
                }

                const fullPost = {
                    ...post,
                    user: {
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        profileImage: user.profileImage,
                        hobbies: user.hobbies || []
                    }
                };

                res.json(fullPost);
            } catch (error) {
                console.error("Error fetching post by ID:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });


        // Get all users
        app.get("/users", async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.json(users);
        });

        // Get all communities
        app.get("/communities", async (req, res) => {
            try {
                const communities = await communitiesCollection.find().toArray();
                res.json(communities);
            } catch (error) {
                console.error("Error fetching communities:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // Get user's communities based on hobbies
        app.get("/users/:email/communities", async (req, res) => {
            const { email } = req.params;

            try {
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).json({ error: "User not found" });
                }

                const userHobbies = user.hobbies || [];

                const matchedCommunities = await communitiesCollection.find({
                    hobbies: { $in: userHobbies }
                }).toArray();

                res.status(200).json(matchedCommunities);
            } catch (err) {
                console.error("Error fetching user communities:", err);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // Get community chat messages
        app.get("/communities/:name/chat", async (req, res) => {
            const { name } = req.params;

            try {
                const chat = await chatsCollection.findOne({ communityName: name });
                if (!chat) {
                    return res.json({ messages: [] });
                }
                res.json(chat);
            } catch (error) {
                console.error("Error fetching chat messages:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // Post message to community chat
        app.post("/communities/:name/chat", async (req, res) => {
            const { name } = req.params;
            const { userEmail, message } = req.body;

            if (!name || !userEmail) {
                return res.status(400).json({ error: "Community name and user email are required" });
            }

            try {
                const user = await usersCollection.findOne({ email: userEmail });
                if (!user) {
                    return res.status(404).json({ error: "User not found" });
                }

                const newMessage = {
                    id: Date.now(),
                    user: {
                        email: user.email,
                        name: `${user.firstName} ${user.lastName}`,
                        avatar: user.profileImage || ""
                    },
                    text: message || "",
                    timestamp: new Date().toISOString()
                };

                await chatsCollection.updateOne(
                    { communityName: name },
                    { $push: { messages: newMessage } },
                    { upsert: true }
                );

                res.json({
                    message: "Chat message added successfully",
                    newMessage
                });
            } catch (error) {
                console.error("Error posting chat message:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // File upload endpoint
        app.post("/communities/:name/chat/file", (req, res) => {
            uploadFile(req, res, async (err) => {
                if (err) {
                    console.error("File upload error:", err);
                    return res.status(400).json({ error: "File upload failed", details: err.message });
                }

                const { name } = req.params;
                const { userEmail } = req.body;
                const file = req.file;

                if (!name || !userEmail || !file) {
                    if (file) fs.unlinkSync(file.path);
                    return res.status(400).json({ error: "Community name, user email and file are required" });
                }

                try {
                    const user = await usersCollection.findOne({ email: userEmail });
                    if (!user) {
                        fs.unlinkSync(file.path);
                        return res.status(404).json({ error: "User not found" });
                    }

                    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
                    const newMessage = {
                        id: Date.now(),
                        user: {
                            email: user.email,
                            name: `${user.firstName} ${user.lastName}`,
                            avatar: user.profileImage || ""
                        },
                        text: file.originalname,
                        fileUrl: fileUrl,
                        type: "file",
                        fileType: file.mimetype,
                        timestamp: new Date().toISOString()
                    };

                    await chatsCollection.updateOne(
                        { communityName: name },
                        { $push: { messages: newMessage } },
                        { upsert: true }
                    );

                    res.json({
                        message: "File uploaded successfully",
                        newMessage
                    });
                } catch (error) {
                    if (file) fs.unlinkSync(file.path);
                    console.error("Error uploading file:", error);
                    res.status(500).json({ error: "Internal server error" });
                }
            });
        });

        // Audio upload endpoint
        app.post("/communities/:name/chat/audio", (req, res) => {
            uploadAudio(req, res, async (err) => {
                if (err) {
                    console.error("Audio upload error:", err);
                    return res.status(400).json({ error: "Audio upload failed", details: err.message });
                }

                const { name } = req.params;
                const { userEmail } = req.body;
                const audioFile = req.file;

                if (!name || !userEmail || !audioFile) {
                    if (audioFile) fs.unlinkSync(audioFile.path);
                    return res.status(400).json({ error: "Community name, user email and audio file are required" });
                }

                try {
                    const user = await usersCollection.findOne({ email: userEmail });
                    if (!user) {
                        fs.unlinkSync(audioFile.path);
                        return res.status(404).json({ error: "User not found" });
                    }

                    const audioUrl = `${req.protocol}://${req.get('host')}/uploads/${audioFile.filename}`;
                    const newMessage = {
                        id: Date.now(),
                        user: {
                            email: user.email,
                            name: `${user.firstName} ${user.lastName}`,
                            avatar: user.profileImage || ""
                        },
                        text: "Audio message",
                        audioUrl: audioUrl,
                        type: "audio",
                        timestamp: new Date().toISOString()
                    };

                    await chatsCollection.updateOne(
                        { communityName: name },
                        { $push: { messages: newMessage } },
                        { upsert: true }
                    );

                    res.json({
                        message: "Audio message uploaded successfully",
                        newMessage
                    });
                } catch (error) {
                    if (audioFile) fs.unlinkSync(audioFile.path);
                    console.error("Error uploading audio:", error);
                    res.status(500).json({ error: "Internal server error" });
                }
            });
        });

        // Get all posts
        app.get("/posts", async (req, res) => {
            try {
                const users = await usersCollection.find({ posts: { $exists: true, $ne: [] } }).toArray();
                const allPosts = users.flatMap(user =>
                    user.posts.map(post => ({
                        ...post,
                        user: {
                            firstName: user.firstName,
                            lastName: user.lastName,
                            profileImage: user.profileImage
                        }
                    }))
                );
                res.json(allPosts);
            } catch (error) {
                console.error("Error fetching posts:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // New endpoint: Get posts filtered by user's hobbies
        app.get("/posts/user/:email", async (req, res) => {
            const { email } = req.params;

            try {
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).json({ error: "User not found" });
                }

                const userHobbies = (user.hobbies || []).map(hobby => hobby.toLowerCase());

                const usersWithPosts = await usersCollection.find({ posts: { $exists: true, $ne: [] } }).toArray();

                const filteredPosts = [];

                usersWithPosts.forEach(userDoc => {
                    userDoc.posts.forEach(post => {
                        const rawTags = post.hashtags || post.hobby || post.category || post.tag || "";
                        let tags = [];

                        if (typeof rawTags === "string") {
                            tags = [rawTags];
                        } else if (Array.isArray(rawTags)) {
                            tags = rawTags;
                        }

                        const cleanedTags = tags.map(t => t.replace("#", "").trim().toLowerCase());

                        const matches = cleanedTags.some(tag => userHobbies.includes(tag));
                        if (matches) {
                            filteredPosts.push({
                                ...post,
                                user: {
                                    firstName: userDoc.firstName,
                                    lastName: userDoc.lastName,
                                    profileImage: userDoc.profileImage
                                }
                            });
                        }
                    });
                });

                res.json(filteredPosts);
            } catch (error) {
                console.error("Error fetching posts by user hobbies:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // Like/unlike post
        app.put("/posts/:postId/like", async (req, res) => {
            const { postId } = req.params;
            const { email, like } = req.body;

            if (!postId || !email || typeof like !== 'boolean') {
                return res.status(400).json({ error: "Post ID, user email and like status are required" });
            }

            try {
                const result = await usersCollection.updateOne(
                    { "posts.id": parseInt(postId) },
                    { $inc: { "posts.$.likes": like ? 1 : -1 } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({ error: "Post not found or like status unchanged" });
                }

                res.json({ message: like ? "Post liked" : "Post unliked" });
            } catch (error) {
                console.error("Error updating like status:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // Add comment to post
        app.post("/posts/:postId/comment", async (req, res) => {
            const { postId } = req.params;
            const { email, text } = req.body;

            if (!postId || !email || !text) {
                return res.status(400).json({ error: "Post ID, user email and comment text are required" });
            }

            try {
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).json({ error: "User not found" });
                }

                const newComment = {
                    id: Date.now(),
                    user: {
                        email: user.email,
                        name: `${user.firstName} ${user.lastName}`,
                        avatar: user.profileImage
                    },
                    text,
                    timestamp: new Date().toISOString()
                };

                const result = await usersCollection.updateOne(
                    { "posts.id": parseInt(postId) },
                    { $push: { "posts.$.comments": newComment } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({ error: "Post not found" });
                }

                res.json({
                    message: "Comment added successfully",
                    comment: newComment
                });
            } catch (error) {
                console.error("Error adding comment:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });





    } finally {
        // Keep connection open
    }
}

run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Server is running!");
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
