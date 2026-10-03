/* The starter case for Alibi — a voice murder mystery.
 *
 * One case, four suspects, a fixed question menu so a table can play the whole
 * thing offline: every suspect answers every menu question in character, keeps
 * one thing back until they are pressed, and lets a fact slip when they are.
 * Signed in, the host writes a new case and answers questions that are not on
 * the menu at all.
 */

window.ALIBI_MENU = [
    { key: "where", ask: "Where were you when the ninth bell rang?" },
    { key: "last", ask: "When did you last see him alive?" },
    { key: "door", ask: "How did you get in or out of the workshop?" },
    { key: "watch", ask: "What do you know about the watch in his hand?" },
    { key: "work", ask: "What was he working on?" },
    { key: "money", ask: "Who inherits?" },
    { key: "argument", ask: "What did the two of you argue about?" },
    { key: "accuse", ask: "Who do you think did it?" },
    { key: "secret", ask: "Is there anything you have not told me?" },
];

window.ALIBI_CASES = [
    {
        id: "ninth-bell",
        title: "The Ninth Bell",
        place: "Vane & Son, clockmakers, on Cutlers Row. The shop below, the workshop above it, the loft above that, and a yard at the back with an outside stair to the workshop landing.",
        when: "Tuesday, 4 March. The ninth bell of the evening service rings at 8:55. Elias Vane was found at 9:04.",
        victim: "Elias Vane, 61, clockmaker. Found at the foot of the workshop stairs with his own broken pocket watch in his hand, stopped at 8:40. The workshop door was bolted from the inside. The yard door was on the latch.",
        brief: "The ninth bell was still ringing when Mrs Pike found him. Nobody in this house agrees on what time anything happened, and every one of them is holding something back. The shop opens at seven. Name the person who pushed him before then.",
        suspects: [
            {
                name: "Nell Harrow",
                role: "apprentice, 24, three years at the bench",
                look: "Sleeves rolled, ink on her fingers, answers before the question is finished.",
                voice: "young, quick, a little too ready",
                alibi: "Up in the loft sorting mainsprings from half past eight until the bell.",
                secret: "She has been copying Elias's regulator escapement into her own notebook, evenings she was never paid for.",
                slip: "She says she counted the ninth bell from the loft — but the loft window has been painted shut since the summer.",
                answers: {
                    where: "In the loft, sorting mainsprings. I went up at half past eight and I did not come down until the bell.",
                    last: "About twenty past eight, in the shop. He told me to leave the regulator alone and go and count springs.",
                    door: "The workshop door was bolted on the inside — I heard him slide it across himself. The yard door is on the latch; the boy uses it, everyone uses it.",
                    watch: "That is the Renn piece. He had been nursing it a fortnight and said it had a temper.",
                    work: "The Renn regulator. It loses four minutes a day and he would not admit the escapement was his own fault.",
                    money: "Aurel inherits. Everyone knows. Elias told him so to his face, in front of me.",
                    argument: "Aurel wanted an advance on the inheritance. Tuesday afternoon, in the shop, loud enough for the street to hear.",
                    accuse: "Aurel. He wanted money on Tuesday and he has been in this house like a ghost ever since.",
                    secret: "I have been copying the escapement into my own notebook. Three years of evenings and not a penny for them. That is what I was doing up there.",
                },
                deflect: "I have told you where I was. Ask me something you do not already know.",
            },
            {
                name: "Aurel Vane",
                role: "nephew and heir, 33, no trade",
                look: "Good coat, damp at the shoulders, and he has not sat down once.",
                voice: "smooth, then brittle when pushed",
                alibi: "Across the yard at the Bell and Anchor until ten to nine, then back to wait in the front room.",
                secret: "Ninety pounds to a bookmaker in the Cornmarket, due Friday, and Elias laughed at him when he asked for it.",
                slip: "He says he rattled a bolted door — but the only door he could reach from the yard is the outer stair door, and that one has no bolt on it at all.",
                answers: {
                    where: "Across the yard, at the Bell and Anchor. I came back at ten to nine and waited in the front room like a guest.",
                    last: "Tuesday afternoon. He would not give me the money and told me to come back when I had a trade of my own.",
                    door: "It was locked when I tried it. Bolted from the inside. I rattled it and gave up and went round to the front.",
                    watch: "I did not know there was a watch in his hand until the constable said so. Nell is the one who keeps talking about it.",
                    work: "I do not follow the bench work. Clocks bore me and he knew that better than anyone.",
                    money: "I inherit the shop and the house. I have known that since I was nineteen.",
                    argument: "He called me a parasite in front of the apprentice. So I went out and drank. That is not a murder.",
                    accuse: "Nell. She is at that bench every evening, writing in that notebook like a woman taking dictation.",
                    secret: "Ninety pounds to a bookmaker in the Cornmarket, due Friday. I asked him for it on Tuesday and he laughed at me.",
                },
                deflect: "I have answered that. Ask me something else and I will answer it too.",
            },
            {
                name: "Mrs Pike",
                role: "housekeeper, 58, eleven years in this house",
                look: "Apron still on, hands folded, and she watches the stairs, not you.",
                voice: "level, tired, and it does not move",
                alibi: "In the kitchen from a quarter past eight; carried the tray up at five past nine and found him.",
                secret: "She has been selling his scrap brass to a dealer in the Shambles, a few pounds a month, for two years.",
                slip: "The tray she carried up was still warm, and the yard door was off the latch — she was not in that kitchen the whole time she says she was.",
                answers: {
                    where: "In my kitchen, from a quarter past eight. I do not go up those stairs unless I am carrying something.",
                    last: "At eight, when I took his tea up. He was at the bench and he did not look up, which was usual.",
                    door: "The workshop door is bolted from the inside every night, and he bolts it himself. The yard door I leave on the latch for the boy.",
                    watch: "He always had a watch in his hand. It is a wonder he did not break one a week, the way he worked.",
                    work: "That Renn regulator. It has had him in a temper for a fortnight and I have heard every word of it.",
                    money: "Aurel inherits the lot. Miss Harrow gets nothing but her evenings, which is a shame and not my business.",
                    argument: "I heard them on Tuesday afternoon. Aurel shouting, Elias quiet. Quiet is worse.",
                    accuse: "I keep my own counsel. But a man does not bolt his door against strangers.",
                    secret: "I have been selling his scrap brass. A few pounds a month, to a man in the Shambles, for two years. Eleven years of service and he never once asked whether I ate.",
                },
                deflect: "That is what I know. Ask another and I will tell you another.",
            },
            {
                name: "Isolde Renn",
                role: "the buyer, 40, commissioned the regulator",
                look: "Still in her coat, though the fire is lit, and her boots are wet.",
                voice: "cool, precise, and she chooses her words",
                alibi: "Arrived at five to nine for a nine o'clock appointment and waited in the front room.",
                secret: "She came back at twenty to nine to take her father's watch off him and be gone, and she was standing in the yard when he fell.",
                slip: "Her coat is damp through and her boots are wet, and it rained from eight — she was not waiting inside all that time.",
                answers: {
                    where: "In the front room, from five to nine. I had an appointment at nine and I read the almanac on the table.",
                    last: "A fortnight ago, when I left the watch with him. I did not see him tonight until they carried him out.",
                    door: "I came in the front door, like a customer. I did not go near the yard.",
                    watch: "That watch is mine. It was my father's and it stopped the day he died. I lent it to Vane as a wager — he said he could make it run.",
                    work: "My regulator. Four minutes a day. He would not hear that it was his own escapement and not my clock.",
                    money: "I know nothing about his will and I care less. I paid him in advance, in full.",
                    argument: "We disagreed about the escapement on Thursday. He was rude. I have been called worse by better.",
                    accuse: "The apprentice watches him the way a cat watches a window. Take that as you like.",
                    secret: "I came back at twenty to nine to take my watch and leave. I was in the yard. I did not knock and I did not go in.",
                },
                deflect: "I have said what I came to say. Ask me another and I will answer it.",
            },
        ],
        culprit: "Aurel Vane",
        verdict: "Aurel Vane pushed his uncle down the workshop stairs at twenty to nine and then told you he was still in the public house.",
        solution: "Elias bolted the workshop door at half past eight, as he did every night, which is why nobody could simply walk in on him — but the workshop also has an outer stair from the yard, and Aurel Vane has known that stair since he was a boy. He left the Bell and Anchor at twenty-five past eight, not at ten to nine. He came up the outside stair and was still arguing about the ninety pounds when the watch broke in his uncle's hand at 8:40. He came down, latched the yard door behind him and walked round to the front, and Mrs Pike — who was in her kitchen the whole time she says she was — never saw him pass. Isolde Renn was standing in that yard at that moment and said nothing, because she had come to take her father's watch back off a man who was still refusing to admit it did not work.",
        breaks: {
            "Nell Harrow": "She counted the ninth bell from the loft, and the loft window has been painted shut since the summer. She was on the stairs, copying a design that was never going to be hers — and she heard the argument start at twenty to nine.",
            "Aurel Vane": "He rattled a door that has no bolt, and he put himself at the yard at ten to nine when the watch in his uncle's hand had already stopped at 8:40.",
            "Mrs Pike": "The tray was still warm when she set it down and the yard door was off the latch. She was out of that kitchen, selling brass that was never hers to sell.",
            "Isolde Renn": "Her coat was wet through and it had been raining since eight. She was in the yard at twenty to nine and heard the fall, and she decided that her father's watch mattered more than saying so.",
        },
    },
];
