// 站点数据
import { defineStore } from "pinia";
import { getDailyRec } from "@/api/recommend";
import { getPlayListCatlist } from "@/api/playlist";
import {
  getUserProfile,
  getUserDetail,
  getUserSubcount,
  getLikelist,
  setLikeSong,
  getUserPlaylist,
  getUserArtist,
  getUserAlbum,
  getUserMv,
} from "@/api/user";
import { isLogin } from "@/utils/auth";
import throttle from "@/utils/throttle";

const useSiteDataStore = defineStore("siteData", {
  state: () => {
    return {
      // 搜索历史
      searchHistory: [],
      // 用户部分
      userLoginStatus: false,
      userData: {
        userId: null, // 用户 id
        detail: {}, // 基础信息
        subcount: {}, // 订阅信息
      },
      userLikeData: {
        songs: [],
        playlists: [],
        artists: [],
        albums: [],
        mvs: [],
      },
      // 每日推荐
      dailySongsData: {
        timestamp: null, // 储存时间
        data: [], // 歌曲数据
      },
      // 歌单分类
      plCatList: {
        allCat: [], // 总分类
        catList: [], // 普通分类
        hqCatList: [], // 精品分类
      },
      // 封面主题
      coverTheme: {},
      coverBackground: null,
    };
  },
  getters: {
    // 获取用户喜欢的音乐歌单 id
    getUserLikePlaylistId() {
      return isLogin() ? this.userLikeData.playlists?.[0]?.id || null : null;
    },
  },
  actions: {
    // 获取每日推荐
    async setDailySongsData() {
      try {
        if (!isLogin()) {
          this.dailySongsData = { timestamp: null, data: [] };
          return false;
        }
        const data = this.dailySongsData.data;
        const timestamp = this.dailySongsData.timestamp;
        if (data[0] && timestamp) {
          console.log("触发日推缓存");
          const currentTime = new Date().getTime();
          const storedTime = parseInt(timestamp, 10);
          const nextDay6AM = new Date(storedTime);
          nextDay6AM.setHours(6, 0, 0, 0);
          if (currentTime <= nextDay6AM.getTime()) {
            return true;
          }
        } else {
          const res = await getDailyRec();
          const data = res.data.dailySongs;
          const currentTime = new Date().getTime();
          const formatData = data.map((v) => {
            return {
              id: v.id,
              name: v.name,
              artist: v.ar,
              album: v.al,
              cover: v.al.picUrl.replace(/^http:/, "https:"),
              reason: v?.reason,
            };
          });
          this.dailySongsData = { timestamp: currentTime, data: formatData };
        }
      } catch (error) {
        showError(error, "每日推荐加载失败");
      }
    },
    // 获取歌单分类
    async setPlCatList() {
      if (this.plCatList.catList?.length && this.plCatList.hqCatList?.length) {
        return false;
      }
      try {
        const [plCatListRes, plHqCatListRes] = await Promise.all([
          getPlayListCatlist(),
          getPlayListCatlist(true),
        ]);
        console.log(plCatListRes, plHqCatListRes);
        this.plCatList.allCat = plCatListRes.categories;
        this.plCatList.catList = plCatListRes.sub;
        this.plCatList.hqCatList = plHqCatListRes.tags;
      } catch (error) {
        showError(error, "分类数据加载失败");
      }
    },
    // 获取用户信息
    async setUserProfile() {
      try {
        if (!isLogin()) return false;
        // 获取用户基本数据
        const userProfile = await getUserProfile();
        this.userData.detail = userProfile;
        this.userData.userId = userProfile.profile.userId;
        // 获取用户全部信息
        const userDetail = await getUserDetail(this.userData.userId);
        if (userDetail) this.userData.detail = userDetail;
        // 获取用户订阅信息
        this.userData.subcount = await getUserSubcount();
        // 获取用户基础数据
        const allUserLikeResult = [
          this.setUserLikeSongs(),
          this.setUserLikePlaylists(),
          this.setUserLikeArtists(),
          this.setUserLikeAlbums(),
          this.setUserLikeMvs(),
        ];
        await Promise.all(allUserLikeResult);
      } catch (error) {
        console.error("用户信息加载失败：", error);
        $message.error("用户信息加载失败");
      }
    },
    // 获取用户喜欢歌曲
    async setUserLikeSongs() {
      try {
        if (!isLogin() || !this.userData.userId) return false;
        // 获取数据
        getLikelist(this.userData.userId).then((res) => {
          this.userLikeData.songs = res.ids;
        });
      } catch (error) {
        console.error("用户喜欢歌曲加载失败：", error);
        $message.error("用户喜欢歌曲加载失败");
      }
    },
    // 获取用户喜欢歌单
    async setUserLikePlaylists() {
      try {
        if (!isLogin() || !this.userData.userId) return false;
        // 计算数量
        const { createdPlaylistCount, subPlaylistCount } = this.userData.subcount;
        const number = createdPlaylistCount + subPlaylistCount ?? 50;
        // 获取数据
        getUserPlaylist(this.userData.userId, number).then((res) => {
          this.userLikeData.playlists = res.playlist;
        });
      } catch (error) {
        console.error("用户喜欢歌单加载失败：", error);
        $message.error("用户喜欢歌单加载失败");
      }
    },
    // 更改用户喜欢歌手
    async setUserLikeArtists() {
      try {
        if (!isLogin()) return false;
        // 获取数据
        getUserArtist().then((res) => {
          this.userLikeData.artists = res.data;
        });
      } catch (error) {
        console.error("用户喜欢歌手加载失败：", error);
        $message.error("用户喜欢歌手加载失败");
      }
    },
    // 更改用户喜欢专辑
    async setUserLikeAlbums() {
      try {
        if (!isLogin()) return false;
        // 必要数据
        let offset = 0;
        let totalCount = null;
        this.userLikeData.albums = [];
        // 获取数据
        while (totalCount === null || offset < totalCount) {
          const res = await getUserAlbum(50, offset);
          res.data.forEach((v) => {
            this.userLikeData.albums.push(v);
          });
          totalCount = res.count;
          offset += 50;
        }
      } catch (error) {
        console.error("用户喜欢专辑加载失败：", error);
        $message.error("用户喜欢专辑加载失败");
      }
    },
    // 更改用户喜欢歌手
    async setUserLikeMvs() {
      try {
        if (!isLogin()) return false;
        // 获取数据
        getUserMv().then((res) => {
          this.userLikeData.mvs = res.data;
        });
      } catch (error) {
        console.error("用户喜欢歌手加载失败：", error);
        $message.error("用户喜欢歌手加载失败");
      }
    },
    // 查找歌曲是否处于喜欢列表
    getSongIsLike(id) {
      return this.userLikeData.songs.includes(id);
    },
    // 移入移除喜欢列表
    async changeLikeList(id, like = true, isPath = false) {
      changeLikeListsData(id, like, isPath, this);
    },
  },
  // 数据持久化
  persist: [
    {
      key: "siteData",
      storage: localStorage,
    },
  ],
});

// 输出错误
const showError = (error, msg, show = true) => {
  console.error(msg, error);
  if (show) $message.error(msg);
};

// 移入移除喜欢列表
const changeLikeListsData = throttle(
  async (id, like, isPath, $this) => {
    try {
      if (!isLogin()) {
        $message.warning("请登录后使用");
        if (typeof $changeLogin !== "undefined") $changeLogin();
        return false;
      }
      if (isPath) return $message.warning("本地歌曲暂不支持该操作");
      const list = $this.userLikeData.songs;
      const exists = list.includes(id);
      const res = await setLikeSong(id, like);
      if (res.code === 200) {
        if (like && !exists) {
          list.push(id);
        } else if (!like && exists) {
          list.splice(list.indexOf(id), 1);
        } else if (like && exists) {
          $message.info("我喜欢的音乐中已存在该歌曲");
        }
      } else $message.error(like ? "喜欢音乐时发生错误" : "取消喜欢音乐时发生错误");
    } catch (error) {
      console.error("歌曲喜欢操作失败：", error);
      $message.error("歌曲喜欢失败，请重试");
    }
  },
  2000,
  "请稍后再操作",
);

export default useSiteDataStore;
