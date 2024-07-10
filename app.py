from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

suits = ['Spades', 'Diamonds', 'Clubs', 'Hearts']
ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

players = []
current_dealer = 0
current_trump = 0
current_round = 1
deck = []
current_player_index = 0
first_player_index = 0

def initialize_deck():
    global deck
    deck = [{'suit': suit, 'rank': rank} for suit in suits for rank in ranks]

def shuffle_deck():
    global deck
    random.shuffle(deck)

def card_value(card):
    return ranks.index(card['rank'])

def deal_cards():
    global first_player_index, current_player_index, deck
    shuffle_deck()
    for player in players:
        player['hand'] = deck[:13]
        deck = deck[13:]
        player['predictions'] = 0
        player['tricks_won'] = 0
        player['has_predicted'] = False
    first_player_index = (current_dealer + 1) % len(players)
    current_player_index = first_player_index
    emit('deal', {'players': players, 'current_trump': suits[current_trump]}, broadcast=True)

def resolve_trick(trick):
    winning_card = trick[0]
    winning_player = 0
    for i in range(1, len(trick)):
        if trick[i]['suit'] == winning_card['suit'] and card_value(trick[i]) > card_value(winning_card):
            winning_card = trick[i]
            winning_player = i
        elif trick[i]['suit'] == suits[current_trump]:
            if winning_card['suit'] != suits[current_trump] or card_value(trick[i]) > card_value(winning_card):
                winning_card = trick[i]
                winning_player = i
    return winning_player

def evaluate_predictions():
    for player in players:
        if player['predictions'] == player['tricks_won']:
            player['score'] += 10 + player['tricks_won']
        else:
            player['score'] += player['tricks_won']

def reset_trump():
    global current_trump
    if current_round % 6 == 0:
        current_trump = (current_trump + 1) % len(suits)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def on_join(data):
    username = data['username']
    new_player = {
        'id': request.sid,
        'username': username,
        'hand': [],
        'predictions': 0,
        'tricks_won': 0,
        'score': 0,
        'has_predicted': False
    }
    players.append(new_player)
    emit('updatePlayers', players, broadcast=True)

@socketio.on('startGame')
def start_game():
    global current_dealer, current_round, current_trump
    if len(players) >= 2:
        current_dealer = 0
        current_round = 1
        current_trump = 0
        deal_cards()

@socketio.on('makePrediction')
def make_prediction(data):
    player_id = data['playerId']
    prediction = data['prediction']
    for player in players:
        if player['id'] == player_id:
            player['predictions'] = prediction
            player['has_predicted'] = True
    if all(player['has_predicted'] for player in players):
        emit('updatePlayers', players, broadcast=True)

@socketio.on('playCard')
def play_card(data):
    player_id = data['playerId']
    card = data['card']
    for player in players:
        if player['id'] == player_id:
            player['hand'].remove(card)
            break
    emit('cardPlayed', {'playerId': player_id, 'card': card}, broadcast=True)
    if all(len(player['hand']) == 0 for player in players):
        winning_player_index = resolve_trick([card])
        players[winning_player_index]['tricks_won'] += 1
        emit('trickWon', {'playerId': players[winning_player_index]['id']}, broadcast=True)
        if all(len(player['hand']) == 0 for player in players):
            evaluate_predictions()
            current_dealer = (current_dealer + 1) % len(players)
            current_round += 1
            reset_trump()
            deal_cards()
        else:
            current_player_index = (current_player_index + 1) % len(players)
            emit('nextPlayer', {'playerId': players[current_player_index]['id']}, broadcast=True)

@socketio.on('disconnect')
def on_disconnect():
    global players
    players = [player for player in players if player['id'] != request.sid]
    emit('updatePlayers', players, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True)
