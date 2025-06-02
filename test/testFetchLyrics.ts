import Receive from "../services/newReceive";

(async () => {
    const receive = new Receive({}, {}, false);

    const artist = "Yoasobi";
    const title = "Tsubame";
    const query = "Full lyrics of Tsubame by Yoasobi";

    const result = await receive.fetchLyrics(artist, title, query);
    console.log("Fetched lyrics:", result.lyrics);
})();
