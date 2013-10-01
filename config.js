module.exports = {
  host: process.env.FORKABLE_CI_HOST || 'https://forkable-ci.herokuapp.com',
  github: {
    repo: process.env.GITHUB_REPO || 'coursefork/forkshop'
  },
  grove: {
    keys: {
      ops: process.env.GROVE_NOTICE_KEY || 'set your notice key here'
    },
    bot: {
        name: 'grobot'
      , avatar: 'https://i.imgur.com/wgOlRFh.png'
    }
  }
}