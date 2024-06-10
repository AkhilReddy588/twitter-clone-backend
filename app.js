const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')
let db

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('server is running on port 3000')
    })
  } catch (e) {
    console.log(`DB ERROR ${e}`)
  }
}

initializeDBAndServer()

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers['authorization']
  if (authHeader) {
    const jwtToken = authHeader.split(' ')[1]
    jwt.verify(jwtToken, 'secret', (error, payload) => {
      if (error) {
        response.status(401).send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  } else {
    response.status(401).send('Invalid JWT Token')
  }
}

//Register API
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectuserQuery = `
      SELECT
        *
      FROM
      user 
      WHERE
      username = '${username}'  
    `
  const dbUser = await db.get(selectuserQuery)
  if (dbUser !== undefined) {
    response.status(400).send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400).send('Password is too short')
    } else {
      const postQuery = `
              INSERT INTO
              user (username, password, name, gender)
              VALUES('${username}', '${hashedPassword}', '${name}', '${gender}')
            `
      await db.run(postQuery)
      response.send('User created successfully')
    }
  }
})

//Login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectuserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectuserQuery)
  console.log(dbUser)
  if (dbUser === undefined) {
    response.status(400).send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched) {
      const payload = {username: username, userId: dbUser.user_id}
      const jwtToken = jwt.sign(payload, 'secret')
      response.send({jwtToken})
    } else {
      response.status(400).send('Invalid password')
    }
  }
})

//API 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const userQuery = `
    SELECT 
      user.name AS username,
      tweet.tweet AS tweet,
      tweet.date_time AS dateTime
    FROM
      user 
      INNER JOIN tweet ON user.user_id = tweet.user_id 
      INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE
      follower.follower_user_id = (
        SELECT user_id FROM user WHERE username = '${username}'
      )
    order by tweet.date_time desc  
    LIMIT 4;`
  const userArray = await db.all(userQuery)
  response.send(userArray)
})

//API 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const userQuery = `SELECT user.name FROM user INNER JOIN follower ON user.user_id=follower.following_user_id WHERE 
      follower.follower_user_id=(SELECT user_id FROM user WHERE username = '${username}');`
  const userArray = await db.all(userQuery)
  response.send(userArray)
})

//API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getQuery = `SELECT user.name FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id WHERE 
      follower.following_user_id=(SELECT user_id FROM user WHERE username = '${username}');`
  const result = await db.all(getQuery)
  response.send(result)
})

//API 6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const getFollowingUsers = `
    SELECT 
      *
    FROM
      follower
    WHERE
      follower_user_id = (
        select user_id from user where username = '${username}'
      )
      AND following_user_id = (
        SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}
      );    
  `
  const tweetUser = await db.all(getFollowingUsers)
  if (tweetUser === undefined) {
    response.status(401).send('Invalid Request')
  } else {
    const getQuery = `
        SELECT
          tweet.tweet,
          count(distinct like.like_id) as likes, 
          count(distinct reply.reply_id) as replies, 
          tweet.date_time as dateTime
        FROM 
        (tweet left join like on tweet.tweet_id = like.tweet_id) left join reply on tweet.tweet_id = reply.tweet_id
        WHERE tweet.tweet_id = ${tweetId};
      `
    const result = await db.get(getQuery)
    response.send(result)
  }
})

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getFollowingUsers = `
    SELECT 
      *
    FROM
      follower inner join tweet on tweet.user_id = follower.follower_user_id
    WHERE
      follower.follower_user_id = (
        select user_id from user where username = '${username}'
      )
      AND follower.following_user_id = (
        SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}
      );    
  `
    const tweetUser = await db.get(getFollowingUsers)
    if (tweetUser === undefined) {
      response.status(401).send('Invalid Request')
    } else {
      const getQuery = `
        SELECT
          username
        FROM 
          user
        WHERE
          user_id = (
            SELECT
            tweet.user_id
            FROM 
            (tweet inner join like on tweet.tweet_id = like.tweet_id) 
            WHERE tweet.tweet_id = ${tweetId}
          )    
      `
      const ans = dbArray => {
        return {
          likes: dbArray.map(obj => obj.username),
        }
      }
      const result = await db.all(getQuery)
      response.send(ans(result))
    }
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getFollowingUsers = `
    SELECT 
      *
    FROM
      follower
    WHERE
      follower_user_id = (
        select user_id from user where username = '${username}'
      )
      AND following_user_id = (
        SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}
      );    
  `
    const tweetUser = await db.all(getFollowingUsers)
    if (tweetUser === undefined) {
      response.status(401).send('Invalid Request')
    } else {
      const getQuery = `
        SELECT
          username as user,
          reply.reply
        FROM 
          user join reply on user.user_id = reply.user_id
        WHERE
          user.user_id = (
            SELECT
            tweet.user_id
            FROM 
            (tweet inner join reply on reply.tweet_id = tweet.tweet_id) 
            WHERE tweet.tweet_id = ${tweetId}
          );    
      `

      const replies = await db.all(getQuery)
      response.send({replies})
    }
  },
)

//API 9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getQuery = `
    SELECT
    tweet.tweet, 
    count(distinct like.user_id) as likes,
    count(distinct reply.user_id) as replies,
    tweet.date_time as dateTime
    FROM
    (user join tweet ON user.user_id = tweet.user_id) join like on user.user_id = like.user_id
    join reply on user.user_id = reply.user_id
    WHERE user.username = '${username}';
  `
  const tweets = await db.all(getQuery)
  response.send(tweets)
})

//API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const postQuery = `
    INSERT INTO 
      tweet(tweet, user_id, date_time)
     VALUES('${tweet}', (SELECT user_id FROM user WHERE username='${username}'), '${new Date()}') ;
  `
  await db.run(postQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const userTweets = `SELECT * FROM tweet 
  WHERE user_id=(SELECT user_id FROM user WHERE username='${username}') AND tweet_id=${tweetId};`
    let userArray = await db.get(userTweets)
    if (userArray !== undefined) {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId}`
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
