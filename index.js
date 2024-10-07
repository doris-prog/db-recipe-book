const express = require('express');
const cors = require('cors');
const { ObjectId } = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const dbname = "scpt-recipe-book";

require('dotenv').config();
const mongoUri = process.env.MONGO_URI;

function generateAccessToken(id, email) {
  let payload = {
    'user_id': id,
    email
  }

  let token = jwt.sign(payload, process.env.TOKEN_SECRET, {
    'expiresIn': '1h'
  });

  return token;
}

function verifyToken(req, res, next) {

  let authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader) {
    token = authHeader.split(' ')[1];
    if (token) {
      jwt.verifyToken(token, process.env.TOKEN_SECRET, function (err, payload) {
        if (err) {
          console.error(err);
          return res.status(403);
        }
        req.user = payload;
        next();
      })
    } else {
      return res.status(403);
    }
  } else {
    return res.status(403);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

async function connect(uri, dbname) {
  let client = await MongoClient.connect(uri, {
    useUnifiedTopology: true
  }
  );

  let db = client.db(dbname);
  return db;
}

// create routes
async function main() {

  let db = await connect(mongoUri, dbname);

  // display all recipes
  app.get("/recipes", async function (req, res) {
    try {
      let recipes = await db.collection("recipes").find().toArray();
      res.json({
        'recipes': recipes
      })
    } catch (error) {
      console.error("Error fetching recipes: ", error);
      res.status(500);
    }
  })

  // only display selected details 
  app.get("/recipes", async function (req, res) {
    try {
      let recipes = await db.collection("recipes").find()
        .project({
          "name": 1,
          "cuisine": 1,
          "tags": 1,
          "prepTime": 1
        }).toArray();
      res.json({
        'recipes': recipes
      })
    } catch (error) {
      console.error("Error fetching recipes: ", error);
      res.status(500);
    }
  })

  // display recipe with the given id
  app.get("/recipes/:id", async function (req, res) {
    try {
      let id = req.params.id;

      let recipe = await db.collection('recipes').findOne({
        "_id": new ObjectId(id)
      });

      if (!recipe) {
        return res.status(404).json({
          "error": "Sorry, recipe not found"
        })
      }
      res.json({
        'recipes': recipe
      })
    } catch (error) {
      console.error("Error fetching recipe: ", error);
      res.status(500);
    }
  })

  // search recipe information by other criterias instead of id
  app.get("/recipes", async function (req, res) {

    try {
      let { tags, cuisine, ingredients, name } = req.query;
      let criteria = {};

      if (tags) {
        criteria["tags.name"] = {
          "$in": tags.split(",")
        }
      }

      if (cuisine) {
        criteria["cuisine.name"] = {
          "$regex": cuisine,
          "$options": "i"
        }
      }

      if (ingredients) {
        criteria["ingredients.name"] = {
          "$in": ingredients.split(",").map(function (i) {
            return new RegExp(i, 'i');
          })
        }
      }

      if (name) {
        criteria["name"] = {
          "$regex": name,
          "$options": "i"
        }
      }

      let recipes = await db.collection("recipes").find(criteria)
        .project({
          "name": 1,
          "cuisine": 1,
          "tags": 1,
          "prepTime": 1
        }).toArray();
      res.json({
        'recipes': recipes
      })
    } catch (error) {
      console.error("Error fetching recipes: ", error);
      res.status(500);
    }
  })

  // add new data
  app.post("/recipes", async function (req, res) {
    try {
      let { name, cuisine, prepTime, cookTime, servings, ingredients, instructions, tags } = req.body;

      if (!name || !cuisine || !prepTime || !cookTime || !servings || !ingredients || !instructions || !tags) {
        return res.status(400).json({
          "error": "Missing fields required"
        })
      }

      // find the id of the related query and add to the new recipe
      let cuisineDoc = await db.collection("cuisines").findOne({
        "name": cuisine
      })

      if (!cuisineDoc) {
        return res.status(400).json({ "error": "Invalid cuisine" })
      }

      // find all the tags that the client want to attach to the recipe doc 
      const tagsDoc = await db.collection("tags").find({
        'name': {
          '$in': tags
        }
      }).toArray();

      let newRecipeDoc = {
        name,
        "cuisine": cuisineDoc,
        prepTime,
        cookTime,
        servings,
        ingredients,
        instructions,
        "tags": tagsDoc,
      }

      // insert new recipe into the collection 
      let result = await db.collection("recipes")
        .insertOne(newRecipeDoc);
      res.status(201).json({
        "message": "New recipe has been created",
        'recipeId': result.insertedId
      })
    } catch (error) {
      console.error(e);
      res.status(500);
    }
  })

  // Update existing data
  app.put("/recipes/:id", async function (req, res) {
    try {
      let id = req.params.id;
      let { name, cuisine, prepTime, cookTime, servings, ingredients, instructions, tags } = req.body;

      if (!name || !cuisine || !prepTime || !cookTime || !servings || !ingredients || !instructions || !tags) {
        return res.status(400).json({
          "error": "Missing fields required"
        })
      }

      // find the id of the related query and add to the new recipe
      let cuisineDoc = await db.collection("cuisines").findOne({
        "name": cuisine
      })

      if (!cuisineDoc) {
        return res.status(400).json({ "error": "Invalid cuisine" })
      }

      // find all the tags that the client want to attach to the recipe doc 
      const tagsDoc = await db.collection("tags").find({
        'name': {
          '$in': tags
        }
      }).toArray();

      let updatedRecipeDoc = {
        name,
        "cuisine": cuisineDoc,
        prepTime,
        cookTime,
        servings,
        ingredients,
        instructions,
        "tags": tagsDoc,
      }

      // insert new recipe into the collection 
      let result = await db.collection("recipes")
        .updateOne({
          "_id": new ObjectId(id)
        }, {
          "$set": updatedRecipeDoc
        });

      // if no matches, no updates done
      if (result.matchedCount == 0) {
        return res.status(404).json({
          "error": "Recipe not found"
        })
      }

      res.status(200).json({
        "Message": "Recipe updated"
      })
    } catch (e) {
      console.error(e);
      res.status(500);
    }
  })

  // Delete data
  app.delete("/recipes/:id", async function (req, res) {
    try {
      let id = req.params.id;

      let results = await db.collection("recipes").deleteOne({
        "_id": new ObjectId(id)
      });

      if (results.deletedCount == 0) {
        return res.status(404).json({
          "error": "Recipe not found"
        });
      }
      res.json({
        "message": "Recipe has been deleted successfully"
      })
    } catch (e) {
      console.error(e);
      res.status(500);
    }
  })

  // Add review
  app.post('/recipes/:id/reviews', async function (req, res) {
    try {
      let recipeId = req.params.id;
      let { user, rating, comment } = req.body;

      if (!user || !rating || !comment) {
        return res.status(400).json({
          "error": "Missing required fields"
        });
      }

      let newReview = {
        review_id: new ObjectId(),
        user,
        rating: Number(rating),
        comment,
        date: new Date()
      };

      let result = await db.collection("recipes").updateOne(
        { "_id": new ObjectId(recipeId) },
        { '$push': { reviews: newReview }}
      );

      if (result.matchedCount == 0) {
        return res.status(404).json({
          "error": "Recipe not found"
        });
      }
      res.status(201).json({
        "message": "Review added successfully",
        'reviewId': newReview.review_id
      });
    } catch (error) {
      console.error('Error adding review: ', error);
      res.status(500);
    }
  });

  // Update review
  app.put('/recipes/:recipeId/reviews/:reviewId', async function (req, res) {
    try {
        let recipeId = req.params.recipeId;
        let reviewId = req.params.reviewId;
        let { user, rating, comment } = req.body;

        if (!user || !rating || !comment) {
          return res.status(400).json({
            "error": "Missing required fields"
          });
        }

        let updatedReview = {
          reviewId: new ObjectId(reviewId),
          user,
          rating: Number(rating),
          comment,
          date: new Date()
        };

        let result = await db.collection("recipes").updateOne(
          {
            "_id": new ObjectId(recipeId),
            "reviews.review_id": new ObjectId(reviewId)
          },
          {
            '$set': { "reviews.$": updatedReview }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            "error": "Recipe or review not found"
          });
        }
        res.json({
          "message": "Review updated successfully",
          reviewId
        });
      } catch (error) {
        console.error("Error updating review: ", error);
        res.status(500);
      }
    });

  // Delete review  
  app.delete("/recipes/:recipeId/reviews/:reviewId", async function (req, res) {
    try {
      let recipeId = req.params.recipeId;
      let reviewId = req.params.reviewId;

      let result = await db.collection("recipes").updateOne({
        "_id": new ObjectId(recipeId)},
        {
          '$pull': {
          "reviews": { 
            reviewId: new ObjectId(reviewId)
          }
        }
      });

      if (result.matchedCount === 0) {
        return res.status(404).json({
          "error": "Recipe not found"
        });
      }

      if (result.modifiedCount === 0) {
        return res.status(404).json({
          "error": "Review not found"
        });
      }
      res.status(200).json({
        "message": "Review deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting review: ", error);
      res.status(500);
    }
  });

  // route for user sign up
  // mandatory info: email and password
  app.post('/users', async function (req, res) {
    try {
      let { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          "error": "Please provide username and password"
        })
      }

      let userDoc = {
        email,
        password: await bcrypt.hash(password, 12)
      };

      let result = await db.collection("users").insertOne(userDoc);
      res.json({
        "message": "New user account has been created",
        result,
      });
    } catch (e) {
      console.error(e);
      res.status(500);
    }
  })

  app.post('/login', async function (req, res) {
    try {
      let { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          "message": "Please provide email and password"
        })
      }

      let user = await db.collection('users').findOne({
        email
      });

      if (user) {
        if (bcrypt.compareSync(password, user.password)) {
          let accessToken = generateAccessToken(user._id, user.email);
          res.json({
            accessToken
          })
        } else {
          res.status(401);
        }
      } else {
        res.status(401);
      }
    } catch (e) {
      console.error(e);
      res.status(500);
    }
  })

  app.get('/profile', verifyToken, async function (req, res) {
    let user = req.user;
    res.json({
      user
    })
  })
}

main();

app.listen(3000, function () {
  console.log("Server has started");
})